/**
 * @module gui/Inspector
 */

import GUI from 'lil-gui';
import Instance from '../core/Instance';
import CameraInspector from './CameraInspector.js';
import EntityPanel from './EntityPanel.js';
import { MAIN_LOOP_EVENTS } from '../core/MainLoop';
import Outliner from './outliner/Outliner.js';
import ProcessingInspector from './ProcessingInspector.js';
import Panel from './Panel.js';
import PackageInfoInspector from './PackageInfoInspector.js';
import InstanceInspector from './InstanceInspector.js';

// Here follows the style adaptation to lil-gui
const styles = `
.lil-gui .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
`;

const styleSheet = document.createElement('style');
styleSheet.type = 'text/css';
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

/**
 * @typedef {object} Options
 * @property {number} [width=450] The panel width, in pixels.
 * @property {string} [title='Inspector'] The title of the inspector.
 */

/**
 * Provides a user interface to inspect and edit the Giro3D scene.
 * The inspector is made of several {@link module:gui/Panel~Panel panels}.
 * You can implement custom panels and add them to the inspector with
 * {@link module:gui/Inspector~Inspector#addPanel addPanel()}.
 *
 */
class Inspector {
    /**
     * Creates an instance of the inspector.
     *
     * @param {HTMLDivElement} div The div element to attach the panel to.
     * @param {Instance} instance The Giro3D instance.
     * @param {Options} options The options.
     */
    constructor(div, instance, options = {}) {
        this.instance = instance;
        this.gui = new GUI({
            autoPlace: false,
            width: options.width ?? 450,
            title: options.title ?? 'Inspector',
        });
        this.gui.close();
        this.gui.add(this, 'collapse');
        div.appendChild(this.gui.domElement);

        this._frameRequesterCb = () => this.update();
        instance.addFrameRequester(
            MAIN_LOOP_EVENTS.UPDATE_START,
            this._frameRequesterCb,
        );

        this.folders = [];

        this.addPanel(new PackageInfoInspector(this.gui, instance));
        this.addPanel(new InstanceInspector(this.gui, instance));
        this.addPanel(new CameraInspector(this.gui, instance));
        this.addPanel(new ProcessingInspector(this.gui, instance));
        this.addPanel(new EntityPanel(this.gui, instance));
        this.addPanel(new Outliner(this.gui, instance));
    }

    collapse() {
        this.folders.forEach(f => f.collapse());
    }

    /**
     * Removes all panel from the inspector.
     *
     */
    clearPanels() {
        while (this.folders.length > 0) {
            this.folders.pop().dispose();
        }
    }

    /**
     * Adds a panel to the inspector.
     *
     * @param {Panel} panel The panel to add.
     */
    addPanel(panel) {
        this.folders.push(panel);
    }

    /**
     * Attaches the inspector to the specified DOM element.
     *
     * @param {HTMLDivElement} div The div element to attach the panel to.
     * @param {Instance} instance The Giro3D instance.
     * @param {Options} [options] The options.
     * @returns {Inspector} The created inspector.
     */
    static attach(div, instance, options = {}) {
        const inspector = new Inspector(div, instance, options);
        return inspector;
    }

    /**
     * Detach this Inspector from its instance.
     *
     */
    detach() {
        this.clearPanels();
        this.instance.removeFrameRequester(
            MAIN_LOOP_EVENTS.UPDATE_START,
            this._frameRequesterCb,
        );
        this.gui.domElement.remove();
    }

    update() {
        this.folders.forEach(f => f.update());
    }
}

export default Inspector;
