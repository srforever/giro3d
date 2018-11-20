import * as THREE from 'three';

import View from '../View';
import { MAIN_LOOP_EVENTS } from '../MainLoop';
import RendererConstant from '../../Renderer/RendererConstant';
import { GeometryLayer } from '../Layer/Layer';
import PlanarTileBuilder from './Planar/PlanarTileBuilder';
import Extent from '../Geographic/Extent';

function compute3857Extent(tileExtent) {
    const extent = new Extent('EPSG:3857',
        -20037508.342789244, 20037508.342789244,
        -20037508.342789255, 20037508.342789244);
    const c = tileExtent.center();
    const layerDimension = extent.dimensions();

    // Each level has 2^n * 2^n tiles...
    // ... so we count how many tiles of the same width as tile we can fit in the layer
    const tileCount = Math.min(
        Math.round(layerDimension.x / tileExtent.dimensions().x),
        Math.round(layerDimension.y / tileExtent.dimensions().y));
    // ... 2^zoom = tilecount => zoom = log2(tilecount)
    const zoom = Math.floor(Math.log2(tileCount));
    const realTileCount = Math.pow(2, zoom);
    const tileSize = {
        x: layerDimension.x / realTileCount,
        y: layerDimension.y / realTileCount,
    };

    // Now that we have computed zoom, we can deduce x and y (or row / column)
    const x = (c.x() - extent.west()) / layerDimension.x;
    const y = (extent.north() - c.y()) / layerDimension.y;

    const left = extent.west() + Math.floor(x * realTileCount) * tileSize.x;
    const top = extent.north() - Math.floor(y * realTileCount) * tileSize.y;
    return new Extent('EPSG:3857',
        left, left + tileSize.x,
        top - tileSize.y, top);
}

export function createPlanarLayer(id, extent, options) {
    const tileLayer = new GeometryLayer(id, options.object3d || new THREE.Group());
    tileLayer.extent = extent;

    if (extent.crs() == 'EPSG:3857') {
        // align quadtree on EPSG:3857 full extent
        const aligned = compute3857Extent(extent);
        if (!extent.isInside(aligned)) {
            throw new Error('oops');
        }
        if (aligned.isInside(extent)) {
            tileLayer.schemeTile = [extent];
        } else {
            tileLayer.schemeTile = [];
            const quads = aligned.quadtreeSplit();
            for (const quad of quads) {
                const inter = quad.intersect(extent);
                if (inter.dimensions().x > 0) {
                    tileLayer.schemeTile.push(inter);
                }
            }
        }
    } else {
        tileLayer.schemeTile = [extent];
    }
    tileLayer.maxSubdivisionLevel = options.maxSubdivisionLevel;

    tileLayer.postUpdate = (context, layer) => {
        for (const r of layer.level0Nodes) {
            r.traverse((node) => {
                if (node.layer != layer || !node.material.visible) {
                    return;
                }
                node.material.uniforms.neighbourdiffLevel.value.set(0, 0, 0, 1);
                const n = findNeighbours(node);
                if (n) {
                    const dimensions = node.extent.dimensions();
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
                            const diff = Math.log2((i % 2) ?
                                Math.round(nn.extent.dimensions().y / dimensions.y) :
                                Math.round(nn.extent.dimensions().x / dimensions.x));

                            node.material.uniforms
                                .neighbourdiffLevel.value.setComponent(i, -diff);
                            node.material.texturesInfo.elevation.neighbours.texture[i] =
                                nn.material.texturesInfo.elevation.texture;

                            const offscale = targetExtent.offsetToParent(nn.extent);
                            node.material.texturesInfo.elevation.neighbours.offsetScale[i] =
                                nn.material.texturesInfo.elevation.offsetScale.clone();

                            node.material.texturesInfo.elevation.neighbours.offsetScale[i].x +=
                                offscale.x * node.material.texturesInfo.elevation.neighbours.offsetScale[i].z;
                            node.material.texturesInfo.elevation.neighbours.offsetScale[i].y +=
                                offscale.y * node.material.texturesInfo.elevation.neighbours.offsetScale[i].w;
                            node.material.texturesInfo.elevation.neighbours.offsetScale[i].z *=
                                offscale.z;
                            node.material.texturesInfo.elevation.neighbours.offsetScale[i].w *=
                                offscale.w;
                        }
                    }
                }
            });
        }
    };

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
            if (node.level == 0 && node.parent.children.length) {
                for (const sibling of node.parent.children) {
                    if (sibling.extent &&
                        extent.isInside(sibling.extent)) {
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
        if (n) {
            return findSmallestExtentCoveringGoingDown(n, extent);
        }
    }

    function findNeighbours(node) {
        // top, right, bottom, left
        const borders = node.extent.externalBorders(0.1);
        return borders.map(border => findSmallestExtentCovering(node, border));
    }

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

    // Setup View
    View.call(this, extent.crs(), viewerDiv, options);

    // Configure camera
    const dim = extent.dimensions();
    const positionCamera = extent.center().clone();
    positionCamera._values[2] = Math.max(dim.x, dim.y);
    const lookat = positionCamera.xyz();
    lookat.z = 0;

    this.camera.camera3D.position.copy(positionCamera.xyz());
    this.camera.camera3D.lookAt(lookat);
    this.camera.camera3D.updateMatrixWorld(true);

    const tileLayer = createPlanarLayer('planar', extent, options);

    this.addLayer(tileLayer);

    this._renderState = RendererConstant.FINAL;
    this._fullSizeDepthBuffer = null;
    this.addFrameRequester(MAIN_LOOP_EVENTS.BEFORE_RENDER, () => {
        if (this._fullSizeDepthBuffer != null) {
            // clean depth buffer
            this._fullSizeDepthBuffer = null;
        }
    });

    this.tileLayer = tileLayer;
}

PlanarView.prototype = Object.create(View.prototype);
PlanarView.prototype.constructor = PlanarView;

PlanarView.prototype.addLayer = function addLayer(layer) {
    return View.prototype.addLayer.call(this, layer, this.tileLayer);
};

export default PlanarView;
