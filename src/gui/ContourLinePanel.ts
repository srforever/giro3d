import type GUI from 'lil-gui';
import Panel from './Panel';
import type Instance from '../core/Instance';
import type ContourLineOptions from '../core/ContourLineOptions';

class ContourLinePanel extends Panel {
    /**
     * @param options - The options.
     * @param parentGui - Parent GUI
     * @param instance - The instance
     */
    constructor(options: ContourLineOptions, parentGui: GUI, instance: Instance) {
        super(parentGui, instance, 'Contour lines');

        this.addController<boolean>(options, 'enabled')
            .name('Enable')
            .onChange(() => this.notify());
        this.addColorController(options, 'color')
            .name('Color')
            .onChange(() => this.notify());
        this.addController<number>(options, 'thickness', 0, 4, 0.1)
            .name('Thickness')
            .onChange(() => this.notify());
        this.addController<number>(options, 'opacity', 0, 1)
            .name('Opacity')
            .onChange(() => this.notify());
        this.addController<number>(options, 'interval', 0, 3000, 1)
            .name('Primary interval (m)')
            .onChange(() => this.notify());
        this.addController<number>(options, 'secondaryInterval', 0, 3000, 1)
            .name('Secondary interval (m)')
            .onChange(() => this.notify());
    }
}

export default ContourLinePanel;
