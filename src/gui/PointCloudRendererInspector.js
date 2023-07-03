import GUI from 'lil-gui';
import Panel from './Panel.js';
import PointCloudRenderer from '../renderer/PointCloudRenderer.js';
import Instance from '../core/Instance.js';

export default class PointCloudRendererInspector extends Panel {
    /**
     * @param {PointCloudRenderer} renderer The renderer.
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The instance.
     */
    constructor(renderer, parentGui, instance) {
        super(parentGui, instance, 'PointCloudRenderer');

        this.renderer = renderer;

        this.addController(this.renderer.edl, 'enabled')
            .name('EDL')
            .onChange(() => this.notify());
        this.addController(this.renderer.edl.parameters, 'radius', 0, 100)
            .name('radius')
            .onChange(() => this.notify());
        this.addController(this.renderer.edl.parameters, 'strength', 0, 2)
            .name('strength')
            .onChange(() => this.notify());

        this.addController(this.renderer.occlusion, 'enabled')
            .name('Ambient Occlusion')
            .onChange(() => this.notify());
        this.addController(this.renderer.occlusion.parameters, 'threshold', 0, 3)
            .name('threshold')
            .onChange(() => this.notify());
        this.addController(this.renderer.occlusion.parameters, 'showRemoved')
            .name('show removed')
            .onChange(() => this.notify());

        this.addController(this.renderer.inpainting, 'enabled')
            .name('Inpainting')
            .onChange(() => this.notify());
        this.addController(this.renderer.inpainting.parameters, 'fill_steps', 0, 10)
            .name('steps')
            .onChange(() => this.notify());
        this.addController(this.renderer.inpainting.parameters, 'depth_contrib', 0, 1)
            .name('depth contribution')
            .onChange(() => this.notify());
        this.addController(this.renderer.inpainting.parameters, 'enableZAttenuation')
            .name('Z attenuation')
            .onChange(() => this.notify());
        this.addController(this.renderer.inpainting.parameters, 'zAttMin', 0, 200)
            .name('Z attenuation min')
            .onChange(() => this.notify());
        this.addController(this.renderer.inpainting.parameters, 'zAttMax', 0, 200)
            .name('Z attenuation max')
            .onChange(() => this.notify());
    }
}
