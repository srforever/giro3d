/**
 * @module gui/RenderingInspector
 */
import GUI from 'lil-gui';
import Panel from './Panel.js';
import Instance from '../core/Instance.js';

class RenderingInspector extends Panel {
    /**
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The instance.
     */
    constructor(parentGui, instance) {
        super(parentGui, instance, 'Visual parameters');

        this.addController(instance.renderingOptions, 'enableEDL')
            .name('EDL')
            .onChange(() => this.notify());
        this.addController(instance.renderingOptions, 'EDLRadius', 0, 2)
            .name('EDL Radius')
            .onChange(() => this.notify());
        this.addController(instance.renderingOptions, 'EDLStrength', 0, 2)
            .name('EDL Strength')
            .onChange(() => this.notify());
        this.addController(instance.renderingOptions, 'enableInpainting')
            .name('Inpainting')
            .onChange(() => this.notify());
        this.addController(instance.renderingOptions, 'inpaintingSteps', 1, 6)
            .name('Inpainting steps')
            .onChange(() => this.notify());
        this.addController(instance.renderingOptions, 'inpaintingDepthContribution', 0.01, 1)
            .name('Inpainting depth contrib.')
            .onChange(() => this.notify());
        this.addController(instance.renderingOptions, 'enablePointCloudOcclusion')
            .name('Point cloud occlusion')
            .onChange(() => this.notify());
    }
}

export default RenderingInspector;
