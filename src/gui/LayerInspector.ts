import type GUI from 'lil-gui';
import { Color } from 'three';
import type Instance from '../core/Instance';
import type Layer from '../core/layer/Layer';
import Panel from './Panel';
import ColorMapInspector from './ColorMapInspector';
import type { BoundingBoxHelper } from '../helpers/Helpers';
import Helpers from '../helpers/Helpers';
import type Map from '../entities/Map';
import SourceInspector from './SourceInspector';
import type { ColorLayer, ElevationLayer } from '../core/layer';
import ColorimetryPanel from './ColorimetryPanel';
import * as MemoryUsage from '../core/MemoryUsage';

/**
 * Inspector for a {@link Layer}.
 *
 */
class LayerInspector extends Panel {
    /** The inspected layer. */
    layer: Layer;
    map: Map;
    state: string;
    sourceCrs: string;
    interpretation: string;
    minmax: { min: number; max: number };
    extentColor: Color;
    showExtent: boolean;
    extentHelper: BoundingBoxHelper | null;
    visible: boolean;
    /** The color map inspector */
    colorMapInspector: ColorMapInspector;
    /** The source inspector. */
    sourceInspector: SourceInspector;
    colorimetryPanel: ColorimetryPanel;
    composerImages = 0;
    cpuMemoryUsage = 'unknown';
    gpuMemoryUsage = 'unknown';

    /**
     * @param gui - The GUI.
     * @param instance - The Giro3D instance.
     * @param map - The map.
     * @param layer - The layer to inspect
     */
    constructor(gui: GUI, instance: Instance, map: Map, layer: Layer) {
        super(gui, instance, `${layer.type} ('${layer.name ?? layer.id}')`);

        this.layer = layer;

        this.map = map;
        this.state = 'idle';
        this.sourceCrs = layer.source.getCrs() ?? instance.referenceCrs;

        this.updateValues();

        this.addController<string>(this.layer, 'id').name('Identifier');
        this.addController<string>(this, 'cpuMemoryUsage').name('Memory usage (CPU)');
        this.addController<string>(this, 'gpuMemoryUsage').name('Memory usage (GPU)');
        if (layer.name) {
            this.addController<string>(this.layer, 'name').name('Name');
        }
        this.addController<string>(this, 'sourceCrs').name('Source CRS');

        this.addController<string>(this, 'state').name('Status');
        this.addController<number>(this.layer, 'resolutionFactor').name('Resolution factor');
        this.addController<boolean>(this.layer, 'visible')
            .name('Visible')
            .onChange(() => {
                this.notify(map);
            });
        this.addController<boolean>(this.layer, 'frozen')
            .name('Frozen')
            .onChange(() => {
                this.notify(map);
            });

        this.interpretation = layer.interpretation.toString();
        this.addController<string>(this, 'interpretation').name('Interpretation');

        this.addController<never>(this, 'repaint')
            .name('Repaint layer')
            .onChange(() => {
                this.notify(map);
            });

        this.addController<number>(this, 'composerImages').name('Loaded images');

        if ((this.layer as ElevationLayer).isElevationLayer) {
            const elevationLayer = this.layer as ElevationLayer;
            this.minmax = { min: elevationLayer.minmax.min, max: elevationLayer.minmax.max };
            this.addController<number>(this.minmax, 'min').name('Minimum elevation');
            this.addController<number>(this.minmax, 'max').name('Maximum elevation');
        }
        if ((this.layer as ColorLayer).isColorLayer) {
            const colorLayer = this.layer as ColorLayer;
            if (colorLayer.elevationRange) {
                this.addController<number>(colorLayer.elevationRange, 'min')
                    .name('Elevation range minimum')
                    .onChange(() => this.notify(map));

                this.addController<number>(colorLayer.elevationRange, 'max')
                    .name('Elevation range maximum')
                    .onChange(() => this.notify(map));
            }

            this.colorimetryPanel = new ColorimetryPanel(
                colorLayer.colorimetry,
                this.gui,
                instance,
            );
        }

        if ('opacity' in this.layer && this.layer.opacity !== undefined) {
            this.addController<number>(this.layer, 'opacity')
                .name('Opacity')
                .min(0)
                .max(1)
                .onChange(() => this.notify(map));
        }

        this.extentColor = new Color('#52ff00');
        this.showExtent = false;
        this.extentHelper = null;

        this.addController<boolean>(this, 'showExtent')
            .name('Show extent')
            .onChange(() => this.toggleExtent());
        this.addColorController(this, 'extentColor')
            .name('Extent color')
            .onChange(() => this.updateExtentColor());

        this.colorMapInspector = new ColorMapInspector(this.gui, instance, layer, layer.colorMap);

        if (this.layer.source) {
            this.sourceInspector = new SourceInspector(this.gui, instance, layer.source);
        }

        this.addController<never>(this, 'disposeLayer').name('Dispose layer');
        this.addController<never>(this, 'removeLayer').name('Remove layer from map');
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
        this.toggleExtent();
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
        this.state = this.layer.loading
            ? `loading (${Math.round(this.layer.progress * 100)}%)`
            : 'idle';
        this.visible = this.layer.visible || true;
        this.composerImages = this.layer.composer?.images?.size ?? 0;
        if ((this.layer as ElevationLayer).isElevationLayer) {
            const elevationLayer = this.layer as ElevationLayer;
            if (elevationLayer.minmax && this.minmax) {
                this.minmax.min = elevationLayer.minmax.min;
                this.minmax.max = elevationLayer.minmax.max;
            }
        }
        const memUsage = this.layer.getMemoryUsage({ renderer: this.instance.renderer });
        this.cpuMemoryUsage = MemoryUsage.format(memUsage.cpuMemory);
        this.gpuMemoryUsage = MemoryUsage.format(memUsage.gpuMemory);

        this._controllers.forEach(c => c.updateDisplay());

        if (this.sourceInspector) {
            this.sourceInspector.updateValues();
        }
    }
}

export default LayerInspector;
