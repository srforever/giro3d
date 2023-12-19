/**
 * @module gui/ContourLinePanel
 */

import GUI from 'lil-gui';
import Panel from './Panel.js';
import Instance from '../core/Instance';

export default class ContourLinePanel extends Panel {
    /**
     * @param {import('../core/ContourLineOptions.js').ContourLineOptions} options The options.
     * @param {GUI} parentGui Parent GUI
     * @param {Instance} instance The instance
     */
    constructor(options, parentGui, instance) {
        super(parentGui, instance, 'Contour lines');

        this.addController(options, 'enabled')
            .name('Enable')
            .onChange(() => this.notify());
        this.addColorController(options, 'color')
            .name('Color')
            .onChange(() => this.notify());
        this.addController(options, 'opacity', 0, 1)
            .name('Opacity')
            .onChange(() => this.notify());
        this.addController(options, 'interval', 0, 3000, 1)
            .name('Primary interval (m)')
            .onChange(() => this.notify());
        this.addController(options, 'secondaryInterval', 0, 3000, 1)
            .name('Secondary interval (m)')
            .onChange(() => this.notify());
    }
}
