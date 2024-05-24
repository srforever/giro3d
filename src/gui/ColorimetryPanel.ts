import type GUI from 'lil-gui';
import Panel from './Panel';
import type Instance from '../core/Instance';
import type ColorimetryOptions from '../core/ColorimetryOptions';

class ColorimetryPanel extends Panel {
    private readonly _options: ColorimetryOptions;

    /**
     * @param options - The options.
     * @param parentGui - Parent GUI
     * @param instance - The instance
     */
    constructor(options: ColorimetryOptions, parentGui: GUI, instance: Instance) {
        super(parentGui, instance, 'Colorimetry');

        this._options = options;

        this.addController<number>(this, 'reset')
            .name('Reset to defaults')
            .min(-1)
            .max(1)
            .onChange(() => this.notify());
        this.addController<number>(options, 'brightness')
            .name('Brightness')
            .min(-1)
            .max(1)
            .onChange(() => this.notify());
        this.addController<number>(options, 'contrast')
            .name('Contrast')
            .min(0)
            .max(10)
            .onChange(() => this.notify());
        this.addController<number>(options, 'saturation')
            .name('Saturation')
            .min(0)
            .max(1)
            .onChange(() => this.notify());
    }

    reset() {
        this._options.brightness = 0;
        this._options.saturation = 1;
        this._options.contrast = 1;

        this.notify();

        this.updateControllers();
    }
}

export default ColorimetryPanel;
