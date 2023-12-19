/**
 * @module gui/HillshadingPanel
 */

import GUI from 'lil-gui';
import Panel from './Panel.js';
import Instance from '../core/Instance';

export default class HillshadingPanel extends Panel {
    /**
     * @param {import('../entities/Map').HillshadingOptions} hillshading The options.
     * @param {GUI} parentGui Parent GUI
     * @param {Instance} instance The instance
     */
    constructor(hillshading, parentGui, instance) {
        super(parentGui, instance, 'Hillshading');

        this.addController(hillshading, 'enabled')
            .name('Enable')
            .onChange(() => this.notify());
        this.addController(hillshading, 'intensity', 0, 1)
            .name('Intensity')
            .onChange(() => this.notify());
        this.addController(hillshading, 'zenith', 0, 90)
            .name('Sun zenith')
            .onChange(() => this.notify());
        this.addController(hillshading, 'azimuth', 0, 360)
            .name('Sun azimuth')
            .onChange(() => this.notify());
        this.addController(hillshading, 'elevationLayersOnly')
            .name('Elevation layers only')
            .onChange(() => this.notify());
    }
}
