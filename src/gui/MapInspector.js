/**
 * @module gui/MapInspector
 */
import GUI from 'lil-gui';
import { Color, MathUtils } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import Instance, { INSTANCE_EVENTS } from '../core/Instance.js';
import TileMesh from '../core/TileMesh.js';
import Map from '../entities/Map.js';
import Helpers from '../helpers/Helpers.js';
import EntityInspector from './EntityInspector.js';
import RenderingState from '../renderer/RenderingState.js';
import LayerInspector from './LayerInspector.js';

function applyToMaterial(root, layer, callback) {
    root.traverse(object => {
        if (object.material && object.layer === layer) {
            callback(object.material);
        }
    });
}

function createTileLabel() {
    const text = document.createElement('div');

    text.style.color = '#FFFFFF';
    text.style.padding = '0.2em 1em';
    text.style.textShadow = '2px 2px 2px black';
    text.style.textAlign = 'center';
    text.style.fontSize = '12px';
    text.style.backgroundColor = 'rgba(0,0,0,0.5)';

    return text;
}

class MapInspector extends EntityInspector {
    /**
     * Creates an instance of MapInspector.
     *
     * @api
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {Map} map The inspected Map.
     */
    constructor(parentGui, instance, map) {
        super(parentGui, instance, map, {
            title: `Map ('${map.id}')`,
            visibility: true,
            boundingBoxColor: true,
            boundingBoxes: true,
            opacity: true,
        });

        /**
         * The inspected map.
         *
         * @type {Map}
         * @api
         */
        this.map = map;

        /**
         * Toggle the wireframe rendering of the map.
         *
         * @type {boolean}
         * @api
         */
        this.wireframe = this.map.wireframe || false;

        /**
         * Toggle the frozen property of the map.
         *
         * @type {boolean}
         * @api
         */
        this.frozen = this.map.frozen || false;

        this.showOutline = this.map.showOutline || false;

        this.showGrid = false;
        this.renderState = 'Normal';

        this.layerCount = this.map._attachedLayers.length;
        this.background = this.map.materialOptions.backgroundColor;
        this.backgroundOpacity = this.map.materialOptions.backgroundOpacity;

        this.extentColor = new Color('red');
        this.showExtent = false;
        this.showTileInfo = false;
        this.extentHelper = null;

        this.mapSegments = this.map.segments;

        this.labels = new window.Map();

        this.addController(this.map, 'projection')
            .name('Projection');
        this.addController(this.map, 'renderOrder')
            .name('Render order')
            .onChange(() => this.notify(map));
        this.addController(this, 'mapSegments')
            .name('Tile subdivisions')
            .min(2)
            .max(128)
            .onChange(v => this.updateSegments(v));
        this.addController(this.map.geometryPool, 'size')
            .name('Geometry pool');
        if (this.map.materialOptions.elevationRange) {
            this.addController(this.map.materialOptions.elevationRange, 'min')
                .name('Elevation range minimum')
                .onChange(() => this.notify(map));

            this.addController(this.map.materialOptions.elevationRange, 'max')
                .name('Elevation range maximum')
                .onChange(() => this.notify(map));
        }
        this.addController(this.map.imageSize, 'width')
            .name('Tile width  (pixels)');
        this.addController(this.map.imageSize, 'height')
            .name('Tile height  (pixels)');
        this.addController(this, 'showGrid')
            .name('Show grid')
            .onChange(v => this.toggleGrid(v));
        this.addColorController(this, 'background')
            .name('Background')
            .onChange(v => this.updateBackgroundColor(v));
        this.addController(this, 'backgroundOpacity')
            .name('Background opacity')
            .min(0)
            .max(1)
            .onChange(v => this.updateBackgroundOpacity(v));
        this.addController(this, 'wireframe')
            .name('Wireframe')
            .onChange(v => this.toggleWireframe(v));
        this.addController(this, 'showOutline')
            .name('Show tiles outline')
            .onChange(v => this.toggleOutlines(v));
        this.addController(this, 'showTileInfo')
            .name('Show tile info')
            .onChange(() => this.toggleBoundingBoxes());
        this.addController(this, 'showExtent')
            .name('Show extent')
            .onChange(() => this.toggleExtent());
        this.addColorController(this, 'extentColor')
            .name('Extent color')
            .onChange(v => this.updateExtentColor(v));
        this.addController(this.map.materialOptions.hillshading, 'enabled')
            .name('Hillshading')
            .onChange(() => this.notify(this.map));
        this.addController(this.map.materialOptions.hillshading, 'elevationLayersOnly')
            .name('Shade only elevation layers')
            .onChange(() => this.notify(this.map));
        this.addController(this.map.materialOptions.hillshading, 'azimuth', 0, 360)
            .name('Sun azimuth')
            .onChange(() => this.notify(this.map));
        this.addController(this.map.materialOptions.hillshading, 'zenith', 0, 90)
            .name('Sun zenith')
            .onChange(() => this.notify(this.map));
        this.addController(this.map.materialOptions, 'discardNoData')
            .name('Discard no-data values')
            .onChange(() => this.notify(this.map));
        this.addController(this, 'layerCount').name('Layer count');
        this.addController(this, 'renderState', ['Normal', 'Picking'])
            .name('Render state')
            .onChange(v => this.setRenderState(v));
        this.addController(this, 'dumpTiles').name('Dump tiles in console');
        this.addController(this, 'disposeMapAndLayers').name('Dispose map and layers');

        /**
         * The layer folder.
         *
         * @type {GUI}
         * @api
         */
        this.layerFolder = this.gui.addFolder('Layers');

        /**
         * @type {Array<LayerInspector>}
         */
        this.layers = [];

        this._fillLayersCb = () => this.fillLayers();
        this.instance.addEventListener(
            INSTANCE_EVENTS.LAYERS_INITIALIZED,
            this._fillLayersCb,
        );

        this.map.addEventListener('layer-added', this._fillLayersCb);
        this.map.addEventListener('layer-removed', this._fillLayersCb);
        this.map.addEventListener('layer-order-changed', this._fillLayersCb);

        this.fillLayers();
    }

    disposeMapAndLayers() {
        const layers = this.map.getLayers();
        for (const layer of layers) {
            this.map.removeLayer(layer, { disposeLayer: true });
        }
        this.instance.remove(this.map);
        this.notify();
    }

    getOrCreateLabel(obj) {
        let label = this.labels.get(obj.id);
        if (!label) {
            label = new CSS2DObject(createTileLabel(obj));
            label.name = 'MapInspector label';
            obj.addEventListener('dispose', () => {
                label.element.remove();
                label.remove();
            });
            obj.add(label);
            obj.updateMatrixWorld();
            this.labels.set(obj.id, label);
        }
        return label;
    }

    updateLabel(tile, visible, color) {
        if (!visible) {
            /** @type {CSS2DObject} */
            const label = this.labels.get(tile.id);
            if (label) {
                label.element.remove();
                label.parent?.remove(label);
                this.labels.delete(tile.id);
            }
        } else {
            const isVisible = tile.visible && tile.material.visible;
            /** @type {CSS2DObject} */
            const label = this.getOrCreateLabel(tile);
            /** @type {HTMLDivElement} */
            const element = label.element;
            element.innerText = `Map=${this.map.id}\n{x=${tile.x},y=${tile.y}} LOD=${tile.z}\n(node #${tile.id})\nprogress=${Math.ceil(tile.progress * 100)}%\nlayers=${tile.material.getLayerCount()}`;
            element.style.color = `#${color.getHexString()}`;
            element.style.opacity = isVisible ? '100%' : '0%';
            tile.OBB().box3D.getCenter(label.position);
            label.updateMatrixWorld();
        }
    }

    toggleBoundingBoxes() {
        const color = new Color(this.boundingBoxColor);
        const noDataColor = new Color('gray');
        // by default, adds axis-oriented bounding boxes to each object in the hierarchy.
        // custom implementations may override this to have a different behaviour.
        this.rootObject.traverseOnce(obj => {
            if (obj instanceof TileMesh) {
                /** @type {TileMesh} */
                const tile = obj;
                let finalColor = new Color();
                const layerCount = obj.material.getLayerCount();
                if (layerCount === 0) {
                    finalColor = noDataColor;
                } else {
                    finalColor = color;
                }
                this.addOrRemoveBoundingBox(tile, this.boundingBoxes, finalColor);

                this.updateLabel(tile, this.showTileInfo, finalColor);
            }
        });
        this.notify(this.entity);
    }

    updateBackgroundOpacity(a) {
        this.backgroundOpacity = a;
        this.map.materialOptions.backgroundOpacity = a;
        this.notify(this.map);
    }

    updateBackgroundColor(color) {
        this.background = color;
        this.map.materialOptions.backgroundColor = new Color(color);
        this.notify(this.map);
    }

    updateExtentColor() {
        if (this.extentHelper) {
            this.instance.threeObjects.remove(this.extentHelper);
            this.extentHelper.material.dispose();
            this.extentHelper.geometry.dispose();
            this.extentHelper = null;
        }
        this.toggleExtent(this.showExtent);
    }

    toggleExtent() {
        if (!this.extentHelper && this.showExtent) {
            const { min, max } = this.map.getElevationMinMax();
            const box = this.map.extent.toBox3(min, max);
            this.extentHelper = Helpers.createBoxHelper(box, this.extentColor);
            this.instance.threeObjects.add(this.extentHelper);
            this.extentHelper.updateMatrixWorld(true);
        }

        if (this.extentHelper) {
            this.extentHelper.visible = this.showExtent;
        }

        this.notify(this.layer);
    }

    updateSegments(v) {
        const val = MathUtils.floorPowerOfTwo(v);
        this.mapSegments = val;
        if (this.map.segments !== val) {
            this.map.segments = val;
            this.notify(this.map);
        }
    }

    setRenderState(state) {
        switch (state) {
            case 'Normal':
                this.map.setRenderState(RenderingState.FINAL);
                break;
            case 'Picking':
                this.map.setRenderState(RenderingState.PICKING);
                break;
            default:
                break;
        }

        this.notify(this.map);
    }

    removeEventListeners() {
        this.instance.removeEventListener(
            INSTANCE_EVENTS.LAYERS_INITIALIZED,
            this._fillLayersCb,
        );

        this.map.removeEventListener('layer-added', this._fillLayersCb);
        this.map.removeEventListener('layer-removed', this._fillLayersCb);
        this.map.removeEventListener('layer-order-changed', this._fillLayersCb);
    }

    dispose() {
        super.dispose();
        this.removeEventListeners();
    }

    dumpTiles() {
        console.log(this.map.level0Nodes);
    }

    /**
     * @param {TileMesh} tile The tile to decorate.
     * @param {boolean} add If true, bounding box is added, otherwise it is removed.
     * @param {Color} color The bounding box color.
     */
    // eslint-disable-next-line class-methods-use-this
    addOrRemoveBoundingBox(tile, add, color) {
        if (add && tile.OBB && tile.visible && tile.material && tile.material.visible) {
            Helpers.addOBB(tile, tile.OBB(), color);
        } else {
            Helpers.removeOBB(tile);
        }
    }

    updateValues() {
        super.updateValues();
        this.toggleBoundingBoxes();
        this.layerCount = this.map._attachedLayers.length;
        this.layers.forEach(l => l.updateValues());
    }

    fillLayers() {
        while (this.layers.length > 0) {
            this.layers.pop().dispose();
        }
        // We reverse the order so that the layers are displayed in a natural order:
        // top layers in the inspector are also on top in the composition.
        this.map.getLayers().reverse().forEach(lyr => {
            const gui = new LayerInspector(this.layerFolder, this.instance, this.map, lyr);
            this.layers.push(gui);
        });
    }

    toggleGrid(value) {
        if (!value) {
            if (this.grid) {
                this.grid.parent.remove(this.grid);
            }
            if (this.axes) {
                this.axes.parent.remove(this.axes);
            }
        } else {
            const dims = this.map.extent.dimensions();
            const size = Math.max(dims.x, dims.y) * 1.1;
            const origin = this.map.extent.center().xyz();

            const grid = Helpers.createGrid(origin, size, 20);
            this.instance.scene.add(grid);
            grid.updateMatrixWorld(true);
            this.grid = grid;

            const axes = Helpers.createAxes(size * 0.05);
            // We don't want to add the axes to the grid because the grid is rotated,
            // which would rotate the axes too and give a wrong information about the vertical axis.
            axes.position.copy(origin);
            this.axes = axes;
            this.axes.updateMatrixWorld(true);
            this.instance.scene.add(axes);
        }
        this.notify();
    }

    toggleOutlines(value) {
        this.map.showOutline = value;
        applyToMaterial(this.rootObject, this.map, material => {
            material.showOutline = value;
            material.needsUpdate = true;
        });
        this.notify(this.map);
    }

    toggleWireframe(value) {
        this.map.wireframe = value;
        applyToMaterial(this.rootObject, this.map, material => {
            material.wireframe = value;
        });
        this.notify(this.map);
    }
}

export default MapInspector;
