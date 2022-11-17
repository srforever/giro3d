/**
 * @module gui/Inspector
 */

import GUI from 'lil-gui';
import Instance from '../Core/Instance.js';
import CameraInspector from './CameraInspector.js';
import EntityPanel from './EntityPanel.js';
import { MAIN_LOOP_EVENTS } from '../Core/MainLoop.js';
import Outliner from './outliner/Outliner.js';
import ProcessingInspector from './ProcessingInspector.js';
import Panel from './Panel.js';

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
 * Provides a user interface to inspect and edit the Giro3D scene.
 * The inspector is made of several {@link module:gui/Panel~Panel panels}.
 * You can implement custom panels and add them to the inspector with
 * {@link module:gui/Inspector~Inspector#addPanel addPanel()}.
 *
 * @api
 */
class Inspector {
    /**
     * Creates an instance of the inspector.
     *
     * @param {HTMLDivElement} div The div element to attach the panel to.
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(div, instance) {
        this.instance = instance;
        this.gui = new GUI({ autoPlace: false, width: 300, title: 'Inspector' });
        this.gui.close();
        this.gui.add(this, 'collapse');
        div.appendChild(this.gui.domElement);

        this._frameRequesterCb = () => this.update();
        instance.addFrameRequester(
            MAIN_LOOP_EVENTS.UPDATE_START,
            this._frameRequesterCb,
        );

        this.folders = [];

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
     * @api
     */
    clearPanels() {
        while (this.folders.length > 0) {
            this.folders.pop().dispose();
        }
    }

    /**
     * Adds a panel to the inspector.
     *
     * @api
     * @param {Panel} panel The panel to add.
     */
    addPanel(panel) {
        this.folders.push(panel);
    }

    /**
     * Attaches the inspector to the specified DOM element.
     *
     * @api
     * @param {HTMLDivElement} div The div element to attach the panel to.
     * @param {Instance} instance The Giro3D instance.
     * @returns {Inspector} The created inspector.
     */
    static attach(div, instance) {
        const inspector = new Inspector(div, instance);
        return inspector;
    }

    /**
     * Detach this Inspector from its instance.
     *
     * @api
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
