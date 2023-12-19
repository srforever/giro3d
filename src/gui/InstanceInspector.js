/**
 * @module gui/InstanceInspector
 */
import GUI from 'lil-gui';
import Panel from './Panel.js';
import Instance from '../core/Instance';
import RenderingInspector from './RenderingInspector.js';
import WebGLRendererInspector from './WebGLRendererInspector.js';

class InstanceInspector extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(gui, instance) {
        super(gui, instance, 'Instance');

        /**
         * Store the CRS code of the instance
         */
        this.instanceCrs = this.instance.referenceCrs;
        this.addController(this, 'instanceCrs').name('CRS');

        this.state = 'idle';
        this.addController(this, 'state').name('Status');
        this.addController(this, 'triggerUpdate').name('Trigger update');

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
