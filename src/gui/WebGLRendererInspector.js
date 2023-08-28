/**
 * @module gui/WebGLRendererInspector
 */
import GUI from 'lil-gui';
import { WebGLRenderer } from 'three';
import Panel from './Panel.js';
import Instance from '../core/Instance.js';

class WebGLRendererInspector extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(gui, instance) {
        super(gui, instance, 'WebGLRenderer');

        /** @type {WebGLRenderer} */
        this.renderer = this.instance.renderer;

        this.addController(this.renderer, 'localClippingEnabled').onChange(() => this.notify());

        this._addCapabilities(this.renderer, this.gui.addFolder('Capabilities'));
    }

    /**
     * @param {WebGLRenderer} renderer The renderer
     * @param {GUI} rendererPanel The GUI
     */
    _addCapabilities(renderer, rendererPanel) {
        const cap = renderer.capabilities;
        const debug = renderer.debug;

        const ctrls = this._controllers;

        function add(ctrl, prop, name) {
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
        const suppObj = {};

        for (const supp of supported) {
            suppObj[supp] = true;
            ctrls.push(extensionPanel.add(suppObj, supp).name(supp));
        }
    }
}

export default WebGLRendererInspector;
