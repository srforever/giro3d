/**
 * @module gui/LayerInspector
 */
import GUI from 'lil-gui';
import { Color } from 'three';
import Instance from '../core/Instance';
import Layer from '../core/layer/Layer';
import Panel from './Panel.js';
import ColorMapInspector from './ColorMapInspector.js';
import Helpers from '../helpers/Helpers';
import Map from '../entities/Map';
import SourceInspector from './SourceInspector.js';

/**
 * Inspector for a {@link module:Core/layer/Layer~Layer Layer}.
 *
 */
class LayerInspector extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {Map} map The map.
     * @param {Layer} layer The layer to inspect
     */
    constructor(gui, instance, map, layer) {
        super(gui, instance, `${layer.type} ('${layer.name ?? layer.id}')`);

        /**
         * The inspected layer.
         *
         * @type {Layer}
         */
        this.layer = layer;

        this.map = map;
        this.state = 'idle';
        this.sourceCrs = layer.source.getCrs() ?? instance.referenceCrs;

        this.updateValues();

        this.addController(this.layer, 'id').name('Identifier');
        this.addController(this.layer, 'name').name('Name');
        this.addController(this, 'sourceCrs').name('Source CRS');

        this.addController(this, 'state')
            .name('Status');
        this.addController(this.layer, 'visible')
            .name('Visible')
            .onChange(() => {
                this.notify(map);
            });

        this.interpretation = layer.interpretation.toString();
        this.addController(this, 'interpretation')
            .name('Interpretation');

        this.addController(this, 'repaint')
            .name('Repaint layer')
            .onChange(() => {
                this.notify(map);
            });

        if (this.layer.type === 'ElevationLayer') {
            this.minmax = { min: '?', max: '?' };
            this.addController(this.minmax, 'min').name('Minimum elevation');
            this.addController(this.minmax, 'max').name('Maximum elevation');
        }
        if (this.layer.type === 'ColorLayer' && this.layer.elevationRange) {
            this.addController(this.layer.elevationRange, 'min')
                .name('Elevation range minimum')
                .onChange(() => this.notify(map));

            this.addController(this.layer.elevationRange, 'max')
                .name('Elevation range maximum')
                .onChange(() => this.notify(map));
        }
        if (this.layer.isColorLayer) {
            this.addController(this.layer, 'brightness')
                .name('Brightness')
                .min(-1)
                .max(1)
                .onChange(() => this.notify(map));
            this.addController(this.layer, 'contrast')
                .name('Contrast')
                .min(0)
                .max(10)
                .onChange(() => this.notify(map));
            this.addController(this.layer, 'saturation')
                .name('Saturation')
                .min(0)
                .max(10)
                .onChange(() => this.notify(map));
        }

        if (this.layer.opacity !== undefined) {
            this.addController(this.layer, 'opacity')
                .name('Opacity')
                .min(0)
                .max(1)
                .onChange(() => this.notify(map));
        }

        this.extentColor = new Color('#52ff00');
        this.showExtent = false;
        this.extentHelper = null;

        this.addController(this, 'showExtent')
            .name('Show extent')
            .onChange(() => this.toggleExtent());
        this.addColorController(this, 'extentColor')
            .name('Extent color')
            .onChange(v => this.updateExtentColor(v));

        /**
         * The color map inspector.
         *
         * @type {GUI}
         */
        this.colorMapInspector = new ColorMapInspector(
            this.gui,
            instance,
            layer,
            layer.colorMap,
        );

        if (this.layer.source) {
            /**
             * The source inspector.
             *
             * @type {GUI}
             */
            this.sourceInspector = new SourceInspector(
                this.gui,
                instance,
                layer.source,
            );
        }

        this.addController(this, 'disposeLayer').name('Dispose layer');
        this.addController(this, 'removeLayer').name('Remove layer from map');
    }

    repaint() {
        this.layer.clear();
    }

    get colorMap() {
        if (this.layer.colorMap) {
            return this.layer.colorMap;
        }

        return { min: '-1', max: '-1', mode: 'N/A' };
    }

    removeLayer() {
        this.map.removeLayer(this.layer);
    }

    disposeLayer() {
        this.layer.dispose();
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
            const box = this.layer.getExtent().toBox3(min, max);
            this.extentHelper = Helpers.createBoxHelper(box, this.extentColor);
            this.instance.threeObjects.add(this.extentHelper);
            this.extentHelper.updateMatrixWorld(true);
        }

        if (this.extentHelper) {
            this.extentHelper.visible = this.showExtent;
        }

        this.notify(this.layer);
    }

    updateValues() {
        this.state = this.layer.loading ? `loading (${Math.round(this.layer.progress * 100)}%)` : 'idle';
        this.visible = this.layer.visible || true;
        if (this.layer.type === 'ElevationLayer') {
            if (this.layer.minmax && this.minmax) {
                this.minmax.min = this.layer.minmax.min;
                this.minmax.max = this.layer.minmax.max;
            }
        }

        this._controllers.forEach(c => c.updateDisplay());
    }
}

export default LayerInspector;
