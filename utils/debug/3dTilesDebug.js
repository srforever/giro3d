import * as THREE from 'three';
import OBBHelper from './OBBHelper.js';
import Instance from '../../src/Core/instance.js';
import GeometryDebug from './GeometryDebug.js';

const invMatrixChangeUpVectorZtoY = new THREE.Matrix4()
    .getInverse(new THREE.Matrix4().makeRotationX(Math.PI / 2));
const invMatrixChangeUpVectorZtoX = new THREE.Matrix4()
    .getInverse(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));

const unitBoxMesh = (function _() {
    const indices = new Uint16Array(
        [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7],
    );
    const positions = new Float32Array(8 * 3);
    new THREE.Vector3(+0.5, +0.5, +0.5).toArray(positions, 0);
    new THREE.Vector3(-0.5, +0.5, +0.5).toArray(positions, 3);
    new THREE.Vector3(-0.5, -0.5, +0.5).toArray(positions, 6);
    new THREE.Vector3(+0.5, -0.5, +0.5).toArray(positions, 9);
    new THREE.Vector3(+0.5, +0.5, -0.5).toArray(positions, 12);
    new THREE.Vector3(-0.5, +0.5, -0.5).toArray(positions, 15);
    new THREE.Vector3(-0.5, -0.5, -0.5).toArray(positions, 18);
    new THREE.Vector3(+0.5, -0.5, -0.5).toArray(positions, 21);
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    return function _() {
        const color = new THREE.Color(Math.random(), Math.random(), Math.random());
        const material = new THREE.LineBasicMaterial({
            color: color.getHex(),
            linewidth: 3,
        });

        const box = new THREE.LineSegments(geometry, material);
        box.frustumCulled = false;
        return box;
    };
}());

export default function create3dTilesDebugUI(datDebugTool, view, _3dTileslayer) {
    const gui = GeometryDebug.createGeometryDebugUI(datDebugTool, view, _3dTileslayer);

    const regionBoundingBoxParent = new THREE.Group();
    view.scene.add(regionBoundingBoxParent);

    // add wireframe
    GeometryDebug.addWireFrameCheckbox(gui, view, _3dTileslayer);

    // Bounding box control
    const obbLayerId = `${_3dTileslayer.id}_obb_debug`;
    const tmpVec3 = new THREE.Vector3();

    const debugIdUpdate = function debugIdUpdate(context, layer, node) {
        const enabled = context.camera.camera3D.layers.test({ mask: 1 << layer.threejsLayer });

        if (!enabled) {
            return;
        }
        const { metadata } = node.userData;

        let helper = node.userData.obb;

        if (node.visible && metadata.boundingVolume) {
            if (!helper) {
                // 3dtiles with region
                if (metadata.boundingVolume.region) {
                    helper = new OBBHelper(metadata.boundingVolume.region, `id:${node.id}`);
                    helper.position.copy(metadata.boundingVolume.region.position);
                    helper.rotation.copy(metadata.boundingVolume.region.rotation);
                    regionBoundingBoxParent.add(helper);
                }
                // 3dtiles with box
                if (metadata.boundingVolume.box) {
                    helper = unitBoxMesh();
                    helper.scale.copy(metadata.boundingVolume.box.getSize(tmpVec3));
                    metadata.boundingVolume.box.getCenter(helper.position);
                }
                // 3dtiles with Sphere
                if (metadata.boundingVolume.sphere) {
                    const geometry = new THREE.SphereGeometry(
                        metadata.boundingVolume.sphere.radius, 32, 32,
                    );
                    const material = new THREE.MeshBasicMaterial({ wireframe: true });
                    helper = new THREE.Mesh(geometry, material);
                    helper.position.copy(metadata.boundingVolume.sphere.center);
                }

                if (helper) {
                    helper.layer = layer;
                    // add the ability to hide all the debug obj for one layer at once
                    const l3js = layer.threejsLayer;
                    helper.layers.set(l3js);
                    if (helper.children.length) {
                        helper.children[0].layers.set(l3js);
                    }
                    node.userData.obb = helper;
                    helper.updateMatrixWorld();
                }

                if (helper && (metadata.magic === 'b3dm' || metadata.magic === 'i3dm') && !metadata.boundingVolume.region) {
                    // compensate B3dm orientation correction
                    const { gltfUpAxis } = _3dTileslayer.asset;
                    helper.updateMatrix();
                    if (gltfUpAxis === undefined || gltfUpAxis === 'Y') {
                        helper.matrix.premultiply(invMatrixChangeUpVectorZtoY);
                    } else if (gltfUpAxis === 'X') {
                        helper.matrix.premultiply(invMatrixChangeUpVectorZtoX);
                    }
                    helper.applyMatrix(new THREE.Matrix4());
                }
                node.add(helper);
                helper.updateMatrixWorld();
            } else {
                helper = node.userData.obb;
            }
            if (helper) {
                helper.visible = true;
                if (typeof helper.setMaterialVisibility === 'function') {
                    helper.setMaterialVisibility(true);
                }
            }
        } else if (helper) {
            helper.visible = false;
            if (typeof helper.setMaterialVisibility === 'function') {
                helper.setMaterialVisibility(false);
            }
        }
    };

    Instance.prototype.addLayer.call(view,
        {
            id: obbLayerId,
            type: 'debug',
            update: debugIdUpdate,
            visible: false,
        }, _3dTileslayer).then(l => {
        gui.add(l, 'visible').name('Bounding boxes').onChange(() => {
            view.notifyChange(_3dTileslayer);
        });
    });

    // The sse Threshold for each tile
    gui.add(_3dTileslayer, 'sseThreshold', 0, 100).name('sseThreshold').onChange(() => {
        view.notifyChange(_3dTileslayer);
    });
}
