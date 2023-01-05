/**
 * @module gui/ColorMapInspector
 */
import GUI from 'lil-gui';
import Instance from '../core/Instance.js';
import ColorMap, { ColorMapMode } from '../core/layer/ColorMap.js';
import Panel from './Panel.js';
import Layer from '../core/layer/Layer.js';

/**
 * Inspector for a {@see ColorMap}.
 *
 * @api
 */
class ColorMapInspector extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {Layer} layer The color map owner.
     * @param {ColorMap} colorMap The color map to inspect.
     */
    constructor(gui, instance, layer, colorMap) {
        super(gui, instance, 'Color map');

        this.colorMap = colorMap;

        if (colorMap !== undefined) {
            this.addController(this.colorMap, 'active')
                .name('Enabled')
                .onChange(() => this.notify(layer));

            this.addController(this.colorMap, 'mode', ColorMapMode)
                .name('Mode')
                .onChange(() => this.notify(layer));

            this.addController(this.colorMap, 'min')
                .name('Lower bound')
                .min(-8000)
                .max(8000)
                .onChange(() => this.notify(layer));

            this.addController(this.colorMap, 'max')
                .name('Upper bound')
                .min(-8000)
                .max(8000)
                .onChange(() => this.notify(layer));
        }
    }
}

export default ColorMapInspector;
