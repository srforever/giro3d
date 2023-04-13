/**
 * @module gui/LayerInspector
 */
import GUI from 'lil-gui';
import { Color } from 'three';
import Instance from '../core/Instance.js';
import Layer from '../core/layer/Layer.js';
import Panel from './Panel.js';
import { UPDATE_STRATEGIES } from '../core/layer/LayerUpdateStrategy.js';
import ColorMapInspector from './ColorMapInspector.js';
import Helpers from '../helpers/Helpers.js';
import Map from '../entities/Map.js';
import SourceInspector from './SourceInspector.js';

/**
 * Inspector for a {@link module:Core/layer/Layer~Layer Layer}.
 *
 * @api
 */
class LayerInspector extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {Map} map The map.
     * @param {Layer} layer The layer to inspect
     */
    constructor(gui, instance, map, layer) {
        super(gui, instance, `${layer.type} ('${layer.id}')`);

        /**
         * The inspected layer.
         *
         * @type {Layer}
         * @api
         */
        this.layer = layer;

        this.map = map;
        this.state = 'idle';

        this.updateValues();

        this.addController(this.layer, 'id').name('Identifier');

        this.addController(this, 'state')
            .name('Status');
        this.addController(this.layer, 'visible')
            .name('Visible')
            .onChange(() => {
                this.notify(layer);
            });

        this.addController(this.layer, 'projection')
            .name('Projection');

        this.interpretation = layer.interpretation.toString();
        this.addController(this, 'interpretation')
            .name('Interpretation');

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

        if (this.layer.opacity !== undefined) {
            this.addController(this.layer, 'opacity')
                .name('Opacity')
                .min(0)
                .max(1)
                .onChange(() => this.notify(layer));
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

        this.addController(this.layer.updateStrategy, 'type', UPDATE_STRATEGIES)
            .name('Update strategy');

        /**
         * The color map inspector.
         *
         * @type {GUI}
         * @api
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
             * @api
             */
            this.sourceInspector = new SourceInspector(
                this.gui,
                instance,
                layer.source,
            );
        }
    }

    get colorMap() {
        if (this.layer.colorMap) {
            return this.layer.colorMap;
        }

        return { min: '-1', max: '-1', mode: 'N/A' };
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
            const box = this.layer.extent.toBox3(min, max);
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
