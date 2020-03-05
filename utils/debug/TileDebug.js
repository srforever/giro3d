import * as THREE from 'three';
import OBBHelper from './OBBHelper';
import TileObjectChart from './charts/TileObjectChart';
import TileVisibilityChart from './charts/TileVisibilityChart';
import Instance from '../../src/Core/instance';
import ObjectRemovalHelper from '../../src/Process/ObjectRemovalHelper';
import GeometryDebug from './GeometryDebug';

function applyToNodeFirstMaterial(view, root, layer, cb) {
    root.traverse(object => {
        if (object.material && object.layer === layer) {
            cb(object.material);
        }
    });
    view.notifyChange();
}

export default function createTileDebugUI(datDebugTool, view, layer, debugInstance) {
    const gui = GeometryDebug.createGeometryDebugUI(datDebugTool, view, layer);

    const objectChardId = `${layer.id}-nb-objects`;
    debugInstance.createChartContainer(objectChardId);
    const visibleChardId = `${layer.id}-nb-visible`;
    debugInstance.createChartContainer(visibleChardId);

    debugInstance.charts.push(new TileObjectChart(objectChardId, layer));
    debugInstance.charts.push(new TileVisibilityChart(visibleChardId, layer));

    layer.showOutline = false;
    layer.wireframe = false;
    const state = {
        objectChart: true,
        visibilityChart: true,
    };

    // tiles outline
    gui.add(layer, 'showOutline').name('Show tiles outline').onChange(newValue => {
        layer.showOutline = newValue;

        applyToNodeFirstMaterial(view, layer.object3d, layer, material => {
            if (material.uniforms) {
                material.uniforms.showOutline = { value: newValue };
                material.needsUpdate = true;
            }
        });
    });

    // tiles wireframe
    gui.add(layer, 'wireframe').name('Wireframe').onChange(newValue => {
        layer.wireframe = newValue;

        applyToNodeFirstMaterial(view, layer.object3d, layer, material => {
            material.wireframe = newValue;
        });
    });

    // TileObjectChart visibility
    gui.add(state, 'objectChart').name('Object chart').onChange(newValue => {
        if (newValue) {
            document.getElementById(objectChardId).parentNode.style.display = 'block';
        } else {
            document.getElementById(objectChardId).parentNode.style.display = 'none';
        }
        debugInstance.updateChartDivSize();
        debugInstance.charts.forEach(c => c.update());
    });

    // TileVisibilityChart visibility
    gui.add(state, 'visibilityChart').name('Visibility chart').onChange(newValue => {
        if (newValue) {
            document.getElementById(visibleChardId).parentNode.style.display = 'block';
        } else {
            document.getElementById(visibleChardId).parentNode.style.display = 'none';
        }
        debugInstance.updateChartDivSize();
        debugInstance.charts.forEach(c => c.update());
    });

    // Bounding box control
    const obb_layer_id = `${layer.id}_obb_debug`;

    function debugIdUpdate(context, layer, node) {
        const enabled = context.camera.camera3D.layers.test({ mask: 1 << layer.threejsLayer });

        if (!node.parent || !enabled) {
            ObjectRemovalHelper.removeChildrenAndCleanupRecursively(layer.id, node);
            return;
        }

        if (!enabled) {
            return;
        }
        const helpers = node.children.filter(n => n.layer == layer);

        if (node.material && node.material.visible) {
            let helper;
            if (helpers.length == 0) {
                // add the ability to hide all the debug obj for one layer at once
                const l = context.view.getLayers(l => l.id === layer.id)[0];
                const l3js = l.threejsLayer;

                helper = new OBBHelper(node.OBB(), `id:${node.id}`);
                helper.children[0].layers.set(l3js);
                helper.layers.set(l3js);
                helper.layer = layer;
                node.add(helper);
                helper.updateMatrixWorld(true);


                const foo = new THREE.AxesHelper(10);
                // foo.layers.set(l3js);
                node.add(foo);
                foo.material.depthTest = false;
                foo.material.transparent = true;
                foo.updateMatrixWorld(true);

                // if we don't do that, our OBBHelper will never get removed,
                // because once a node is invisible, children are not removed
                // any more
                // FIXME a proper way of notifying tile deletion to children layers should be implemented
                node.setDisplayed = function setDisplayed(show) {
                    this.material.visible = show;
                };
            } else {
                helper = helpers[0];
            }
            if (layer.id == obb_layer_id) {
                helper.setMaterialVisibility(true);
                helper.update(node.OBB());
            }
        } else {
            // hide obb children
            for (const child of node.children.filter(n => n.layer == layer.id)) {
                if (typeof child.setMaterialVisibility === 'function') {
                    child.setMaterialVisibility(false);
                }
                child.visible = false;
            }
        }
    }

    Instance.prototype.addLayer.call(view,
        {
            id: obb_layer_id,
            type: 'debug',
            update: debugIdUpdate,
            preUpdate: () => {},
            visible: false,
        }, layer).then(l => {
        gui.add(l, 'visible').name('Bounding boxes').onChange(() => {
            view.notifyChange(l);
        });
    });
}
