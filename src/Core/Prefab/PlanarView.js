import * as THREE from 'three';

import Instance from '../instance.js';
import { MAIN_LOOP_EVENTS } from '../MainLoop.js';
import RendererConstant from '../../Renderer/RendererConstant.js';
import { GeometryLayer } from '../Layer/Layer.js';
import PlanarTileBuilder from './Planar/PlanarTileBuilder.js';
import Extent from '../Geographic/Extent.js';
import Coordinates from '../Geographic/Coordinates.js';

function findCellWith(x, y, layerDimension, tileCount) {
    const tx = tileCount * x / layerDimension.x;
    const ty = tileCount * y / layerDimension.y;
    // if the user configures an extent with exact same dimension as the "reference" extent of the
    // crs, they won't expect this function to return the tile immediately to the bottom right.
    // therefore, if tx or ty is exactly one, we need to give back 0 instead.  we consider inclusive
    // bounds actually.
    return { x: tx === 1 ? 0 : Math.floor(tx), y: ty === 1 ? 0 : Math.floor(ty) };
}


// return the 3857 tile that fully contains the given extent
function compute3857Extent(tileExtent) {
    const extent = new Extent('EPSG:3857',
        -20037508.342789244, 20037508.342789244,
        -20037508.342789244, 20037508.342789244);
    const layerDimension = extent.dimensions();

    // Each level has 2^n * 2^n tiles...
    // ... so we count how many tiles of the same width as tile we can fit in the layer
    const tileCount = Math.min(
        Math.floor(layerDimension.x / tileExtent.dimensions().x),
        Math.floor(layerDimension.y / tileExtent.dimensions().y),
    );
    // ... 2^zoom = tilecount => zoom = log2(tilecount)
    const zoom = Math.floor(Math.max(0, Math.log2(tileCount)));

    const tl = new Coordinates('EPSG:3857', tileExtent.west(), tileExtent.north());
    const br = new Coordinates('EPSG:3857', tileExtent.east(), tileExtent.south());
    const realTileCount = 2 ** zoom;

    // compute tile that contains the center
    const topLeft = findCellWith(
        tl.x() - extent.west(), extent.north() - tl.y(),
        layerDimension, realTileCount,
    );
    const bottomRight = findCellWith(
        br.x() - extent.west(), extent.north() - br.y(),
        layerDimension, realTileCount,
    );

    const tileSize = {
        x: layerDimension.x / realTileCount,
        y: layerDimension.y / realTileCount,
    };

    const extents = [];
    for (let i = topLeft.x; i <= bottomRight.x; i++) {
        for (let j = topLeft.y; j <= bottomRight.y; j++) {
            const west = extent.west() + i * tileSize.x;
            const north = extent.north() - j * tileSize.y;

            extents.push(new Extent('EPSG:3857',
                west, west + tileSize.x,
                north - tileSize.y, north));
        }
    }
    return extents;
}

function findSmallestExtentCoveringGoingDown(node, extent) {
    if (node.children) {
        for (const c of node.children) {
            if (c.extent) {
                if (extent.isInside(c.extent)) {
                    return findSmallestExtentCoveringGoingDown(c, extent);
                }
            }
        }
    }
    return [node, extent];
}
function findSmallestExtentCoveringGoingUp(node, extent) {
    if (extent.isInside(node.extent)) {
        return node;
    }
    if (!node.parent || !node.parent.extent) {
        if (node.level === 0 && node.parent.children.length) {
            for (const sibling of node.parent.children) {
                if (sibling.extent
                    && extent.isInside(sibling.extent)) {
                    return sibling;
                }
            }
        }
        return undefined;
    }
    return findSmallestExtentCoveringGoingUp(node.parent, extent);
}
function findSmallestExtentCovering(node, extent) {
    const n = findSmallestExtentCoveringGoingUp(node, extent);
    if (!n) {
        return null;
    }
    return findSmallestExtentCoveringGoingDown(n, extent);
}
function findNeighbours(node) {
    // top, right, bottom, left
    const borders = node.extent.externalBorders(0.1);
    return borders.map(border => findSmallestExtentCovering(node, border));
}

export function createPlanarLayer(id, extent, options = {}) {
    const tileLayer = new GeometryLayer(id, options.object3d || new THREE.Group());
    const crs = Array.isArray(extent) ? extent[0].crs() : extent.crs();

    if (crs === 'EPSG:3857') {
        // align quadtree on EPSG:3857 full extent
        const aligned = compute3857Extent(extent);
        tileLayer.schemeTile = aligned;
        tileLayer.validityExtent = extent;
    } else {
        if (Array.isArray(extent)) {
            tileLayer.schemeTile = extent;
        } else {
            tileLayer.schemeTile = [extent];
        }
        tileLayer.validityExtent = tileLayer.extent;
    }
    tileLayer.extent = tileLayer.schemeTile[0].clone();
    for (let i = 1; i < tileLayer.schemeTile.length; i++) {
        tileLayer.extent.union(tileLayer.schemeTile[i]);
    }

    tileLayer.sseScale = 1.5;
    tileLayer.maxSubdivisionLevel = options.maxSubdivisionLevel;
    tileLayer.tileParams = options.tileParams || {};

    tileLayer.postUpdate = (context, layer) => {
        for (const r of layer.level0Nodes) {
            r.traverse(node => {
                if (node.layer !== layer || !node.material.visible) {
                    return;
                }
                node.material.uniforms.neighbourdiffLevel.value.set(0, 0, 0, 1);
                const n = findNeighbours(node);
                if (n) {
                    const dimensions = node.extent.dimensions();
                    const elevationNeighbours = node.material.texturesInfo.elevation.neighbours;
                    for (let i = 0; i < 4; i++) {
                        if (!n[i] || !n[i][0].material.visible) {
                            // neighbour is missing or smaller => don't do anything
                            node.material.uniforms
                                .neighbourdiffLevel.value.setComponent(i, 1);
                        } else {
                            const nn = n[i][0];
                            const targetExtent = n[i][1];

                            // We want to compute the diff level, but can't directly
                            // use nn.level - node.level, because there's no garuantee
                            // that we're on a regular grid.
                            // The only thing we can assume is their shared edge are
                            // equal with a power of 2 factor.
                            const diff = Math.log2((i % 2)
                                ? Math.round(nn.extent.dimensions().y / dimensions.y)
                                : Math.round(nn.extent.dimensions().x / dimensions.x));

                            node.material.uniforms
                                .neighbourdiffLevel.value.setComponent(i, -diff);
                            elevationNeighbours.texture[i] = nn
                                .material
                                .texturesInfo
                                .elevation
                                .texture;

                            const offscale = targetExtent.offsetToParent(nn.extent);

                            elevationNeighbours.offsetScale[i] = nn
                                .material
                                .texturesInfo
                                .elevation
                                .offsetScale
                                .clone();

                            elevationNeighbours.offsetScale[i].x
                                += offscale.x * elevationNeighbours.offsetScale[i].z;
                            elevationNeighbours.offsetScale[i].y
                                += offscale.y * elevationNeighbours.offsetScale[i].w;
                            elevationNeighbours.offsetScale[i].z *= offscale.z;
                            elevationNeighbours.offsetScale[i].w *= offscale.w;
                        }
                    }
                }
            });
        }
    };

    tileLayer.builder = new PlanarTileBuilder();
    tileLayer.protocol = 'tile';
    tileLayer.visible = true;
    tileLayer.lighting = {
        enable: false,
        position: { x: -0.5, y: 0.0, z: 1.0 },
    };
    return tileLayer;
}

function PlanarView(viewerDiv, extent, options = {}) {
    THREE.Object3D.DefaultUp.set(0, 0, 1);

    const tileLayer = createPlanarLayer('planar', extent, options);

    // Setup Instance
    Instance.call(this, viewerDiv, tileLayer.extent.crs(), options);

    // Configure camera
    const dim = tileLayer.extent.dimensions();
    const positionCamera = tileLayer.extent.center().clone();
    positionCamera._values[2] = Math.max(dim.x, dim.y);
    const lookat = positionCamera.xyz();
    lookat.z = 0;

    this.camera.camera3D.position.copy(positionCamera.xyz());
    this.camera.camera3D.lookAt(lookat);
    this.camera.camera3D.updateMatrixWorld(true);


    this.addLayer(tileLayer);

    this._renderState = RendererConstant.FINAL;
    this._fullSizeDepthBuffer = null;
    this.addFrameRequester(MAIN_LOOP_EVENTS.BEFORE_RENDER, () => {
        if (this._fullSizeDepthBuffer !== null) {
            // clean depth buffer
            this._fullSizeDepthBuffer = null;
        }
    });

    this.tileLayer = tileLayer;
}

PlanarView.prototype = Object.create(Instance.prototype);
PlanarView.prototype.constructor = PlanarView;

PlanarView.prototype.addLayer = function addLayer(layer) {
    return Instance.prototype.addLayer.call(this, layer, this.tileLayer);
};

export default PlanarView;
