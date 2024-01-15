// eslint-disable-next-line import/no-named-as-default
import type GUI from 'lil-gui';
import Panel from './Panel';
import type Instance from '../core/Instance';
import RenderingInspector from './RenderingInspector';
import WebGLRendererInspector from './WebGLRendererInspector';

class InstanceInspector extends Panel {
    /** Store the CRS code of the instance */
    instanceCrs: string;
    state: string;
    webGlRendererPanel: WebGLRendererInspector;
    enginePanel: RenderingInspector;

    /**
     * @param gui The GUI.
     * @param instance The Giro3D instance.
     */
    constructor(gui: GUI, instance: Instance) {
        super(gui, instance, 'Instance');

        this.instanceCrs = this.instance.referenceCrs;
        this.addController<string>(this, 'instanceCrs').name('CRS');

        this.state = 'idle';
        this.addController<string>(this, 'state').name('Status');
        this.addController<never>(this, 'triggerUpdate').name('Trigger update');

        this.webGlRendererPanel = new WebGLRendererInspector(this.gui, instance);
        this.enginePanel = new RenderingInspector(this.gui, instance);
    }

    triggerUpdate() {
        this.instance.notifyChange();
    }

    updateValues() {
        this.state = this.instance.loading
            ? `loading (${Math.round(this.instance.progress * 100)}%)`
            : 'idle';
    }

    update() {
        if (!this.gui._closed) {
            this.updateControllers();
            this.webGlRendererPanel.update();
            this.enginePanel.update();
        }
    }
}

export default InstanceInspector;
