// eslint-disable-next-line import/no-named-as-default
import type GUI from 'lil-gui';
import type Instance from '../core/Instance';
import type ColorMap from '../core/layer/ColorMap';
import { ColorMapMode } from '../core/layer/ColorMap';
import Panel from './Panel';
import type Layer from '../core/layer/Layer';

/**
 * Inspector for a {@link ColorMap}.
 *
 */
class ColorMapInspector extends Panel {
    colorMap: ColorMap;

    /**
     * @param gui The GUI.
     * @param instance The Giro3D instance.
     * @param layer The color map owner.
     * @param colorMap The color map to inspect.
     */
    constructor(gui: GUI, instance: Instance, layer: Layer, colorMap?: ColorMap) {
        super(gui, instance, 'Color map');

        this.colorMap = colorMap;

        if (colorMap !== undefined) {
            this.addController<boolean>(this.colorMap, 'active')
                .name('Enabled')
                .onChange(() => this.notify(layer));

            this.addController<ColorMapMode>(this.colorMap, 'mode', ColorMapMode)
                .name('Mode')
                .onChange(() => this.notify(layer));

            this.addController<number>(this.colorMap, 'min')
                .name('Lower bound')
                .min(-8000)
                .max(8000)
                .onChange(() => this.notify(layer));

            this.addController<number>(this.colorMap, 'max')
                .name('Upper bound')
                .min(-8000)
                .max(8000)
                .onChange(() => this.notify(layer));
        }
    }
}

export default ColorMapInspector;
