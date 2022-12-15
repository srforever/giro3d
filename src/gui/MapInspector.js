/**
 * @module gui/MapInspector
 */
import GUI from 'lil-gui';
import { Color } from 'three';
import Instance, { INSTANCE_EVENTS } from '../Core/Instance.js';
import TileMesh from '../Core/TileMesh.js';
import Map from '../entities/Map.js';
import Helpers from '../helpers/Helpers.js';
import EntityInspector from './EntityInspector.js';
import RenderingState from '../Renderer/RenderingState.js';
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

        this.addController(this.map, 'projection')
            .name('Projection');
        this.addController(this.map, 'segments')
            .name('Tile subdivisions');
        this.addController(this.map.imageSize, 'w')
            .name('Tile width  (pixels)');
        this.addController(this.map.imageSize, 'h')
            .name('Tile height  (pixels)');
        this.addController(this, 'showGrid')
            .name('Show grid')
            .onChange(v => this.toggleGrid(v));
        this.addController(this, 'wireframe')
            .name('Wireframe')
            .onChange(v => this.toggleWireframe(v));
        this.addController(this, 'showOutline')
            .name('Show tiles outline')
            .onChange(v => this.toggleOutlines(v));
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

    setRenderState(state) {
        function setState(obj, s) {
            if (obj.changeState) {
                obj.changeState(s);
            }
        }

        switch (state) {
            case 'Normal':
                this.map.object3d.traverse(o => setState(o, RenderingState.FINAL));
                break;
            case 'Depth':
                this.map.object3d.traverse(o => setState(o, RenderingState.DEPTH));
                break;
            case 'UV':
                this.map.object3d.traverse(o => setState(o, RenderingState.UV));
                break;
            case 'ID':
                this.map.object3d.traverse(o => setState(o, RenderingState.ID));
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
    }

    fillLayers() {
        while (this.layers.length > 0) {
            this.layers.pop().dispose();
        }
        this.map.getLayers().forEach(lyr => {
            const gui = new LayerInspector(this.layerFolder, this.instance, lyr);
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
