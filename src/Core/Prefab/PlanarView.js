import * as THREE from 'three';

import View from '../View';
import { MAIN_LOOP_EVENTS } from '../MainLoop';
import RendererConstant from '../../Renderer/RendererConstant';

import { GeometryLayer } from '../Layer/Layer';

import { processTiledGeometryNode } from '../../Process/TiledNodeProcessing';
import PlanarTileBuilder from './Planar/PlanarTileBuilder';
import SubdivisionControl from '../../Process/SubdivisionControl';

export function createPlanarLayer(id, extent, options) {
    const tileLayer = new GeometryLayer(id, options.object3d || new THREE.Group());
    tileLayer.extent = extent;
    tileLayer.schemeTile = [extent];

    tileLayer.postUpdate = (context, layer) => {
        for (const r of layer.level0Nodes) {
            r.traverse((node) => {
                if (node.layer != layer || !node.material.visible) {
                    return;
                }
                node.material.uniforms.neighbourdiffLevel.value.set(0, 0, 0, 1);
                const n = findNeighbours(node);
                if (n) {
                    for (let i = 0; i < 4; i++) {
                        if (!n[i] || !n[i][0].material.visible) {
                            // neighbour is missing or smaller => don't do anything
                            node.material.uniforms
                                .neighbourdiffLevel.value.setComponent(i, 1);
                        } else {
                            const nn = n[i][0];
                            const targetExtent = n[i][1];
                            node.material.uniforms
                                .neighbourdiffLevel.value.setComponent(i, nn.level - node.level);
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

                                // nn.material.texturesInfo.elevation.offsetScale;
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
        if (node.level == 0) {
            return;
        }

        const dim = node.extent.dimensions();
        // top, right, bottom, left
        const result = [
            findSmallestExtentCovering(node, node.extent.clone().shift(0, dim.y)),
            findSmallestExtentCovering(node, node.extent.clone().shift(dim.x, 0)),
            findSmallestExtentCovering(node, node.extent.clone().shift(0, -dim.y)),
            findSmallestExtentCovering(node, node.extent.clone().shift(-dim.x, 0)),
        ];
        return result;
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

    this.camera.setPosition(positionCamera);
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
