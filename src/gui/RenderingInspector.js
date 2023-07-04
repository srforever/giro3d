/**
 * @module gui/RenderingInspector
 */
import GUI from 'lil-gui';
import Panel from './Panel.js';
import Instance from '../core/Instance.js';
import C3DEngine from '../renderer/c3DEngine.js';

class RenderingInspector extends Panel {
    /**
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The instance.
     */
    constructor(parentGui, instance) {
        super(parentGui, instance, 'Rendering');

        /** @type {C3DEngine} */
        this.engine = instance.mainLoop.gfxEngine;
    }
}

export default RenderingInspector;
