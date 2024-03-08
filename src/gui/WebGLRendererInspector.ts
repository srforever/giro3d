// eslint-disable-next-line import/no-named-as-default
import type GUI from 'lil-gui';
import type { WebGLRenderer } from 'three';
import Panel from './Panel';
import type Instance from '../core/Instance';

class WebGLRendererInspector extends Panel {
    renderer: WebGLRenderer;

    /**
     * @param gui - The GUI.
     * @param instance - The Giro3D instance.
     */
    constructor(gui: GUI, instance: Instance) {
        super(gui, instance, 'WebGLRenderer');

        this.renderer = this.instance.renderer;

        this.addController<boolean>(this.renderer, 'localClippingEnabled').onChange(() => this.notify());

        this._addCapabilities(this.renderer, this.gui.addFolder('Capabilities'));
    }

    /**
     * @param renderer - The renderer
     * @param rendererPanel - The GUI
     */
    _addCapabilities(renderer: WebGLRenderer, rendererPanel: GUI) {
        const cap = renderer.capabilities;
        const debug = renderer.debug;

        const ctrls = this._controllers;

        function add(ctrl: object, prop: string, name: string) {
            ctrls.push(rendererPanel.add(ctrl, prop).name(name));
        }

        add(cap, 'isWebGL2', 'WebGL 2');
        add(cap, 'maxTextures', 'Max texture units');
        add(cap, 'maxTextureSize', 'Max texture size');
        add(cap, 'precision', 'Precision');
        add(cap, 'maxFragmentUniforms', 'Max fragment shader uniforms');
        add(cap, 'logarithmicDepthBuffer', 'Logarithmic depth buffer');
        add(cap, 'maxAttributes', 'Max shader attributes');
        add(debug, 'checkShaderErrors', 'Check shader errors');

        const extensionPanel = rendererPanel.addFolder('Extensions');
        extensionPanel.close();

        const supported = renderer.getContext().getSupportedExtensions();
        const suppObj: Record<string, boolean> = {};

        for (const supp of supported) {
            suppObj[supp] = true;
            ctrls.push(extensionPanel.add(suppObj, supp).name(supp));
        }
    }
}

export default WebGLRendererInspector;
