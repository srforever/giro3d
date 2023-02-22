/**
 * @module gui/MapInspector
 */
import GUI from 'lil-gui';
import { Color, MathUtils } from 'three';
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
            title: `Map (${map.id})`,
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

        this.extentColor = new Color('red');
        this.showExtent = false;
        this.extentHelper = null;

        this.mapSegments = this.map.segments;

        this.addController(this.map, 'projection')
            .name('Projection');
        this.addController(this, 'mapSegments')
            .name('Tile subdivisions')
            .min(2)
            .max(128)
            .onChange(v => this.updateSegments(v));
        this.addController(this.map.imageSize, 'w')
            .name('Tile width  (pixels)');
        this.addController(this.map.imageSize, 'h')
            .name('Tile height  (pixels)');
        this.addController(this, 'showGrid')
            .name('Show grid')
            .onChange(v => this.toggleGrid(v));
        this.addColorController(this, 'background')
            .name('Background')
            .onChange(v => this.updateBackgroundColor(v));
        this.addController(this, 'wireframe')
            .name('Wireframe')
            .onChange(v => this.toggleWireframe(v));
        this.addController(this, 'showOutline')
            .name('Show tiles outline')
            .onChange(v => this.toggleOutlines(v));
        this.addController(this, 'showExtent')
            .name('Show extent')
            .onChange(() => this.toggleExtent());
        this.addColorController(this, 'extentColor')
            .name('Extent color')
            .onChange(v => this.updateExtentColor(v));
        this.addController(this.map.materialOptions, 'hillshading')
            .name('Hillshading')
            .onChange(() => this.notify(this.map));
        this.addController(this, 'frozen')
            .name('Freeze updates')
            .onChange(v => this.toggleFrozen(v));
        this.addController(this, 'layerCount').name('Layer count');
        this.addController(this, 'dumpTiles').name('Dump tiles in console');
        this.addController(this, 'renderState', ['Normal', 'Depth', 'UV', 'ID'])
            .name('Render state')
            .onChange(v => this.setRenderState(v));

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

        this.fillLayers();
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
            case 'Depth':
                this.map.setRenderState(RenderingState.DEPTH);
                break;
            case 'UV':
                this.map.setRenderState(RenderingState.UV);
                break;
            case 'ID':
                this.map.setRenderState(RenderingState.ID);
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
        this.layerCount = this.map._attachedLayers.length;
        if (this.boundingBoxes) {
            this.toggleBoundingBoxes(true);
        }
        this.layers.forEach(l => l.updateValues());
    }

    fillLayers() {
        while (this.layers.length > 0) {
            this.layers.pop().dispose();
        }
        this.map.getLayers().forEach(lyr => {
            const gui = new LayerInspector(this.layerFolder, this.instance, this.map, lyr);
            this.layers.push(gui);
        });
    }

    toggleFrozen(value) {
        this.map.frozen = value;
        this.notify();
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
