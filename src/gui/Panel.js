/**
 * @module gui/Panel
 */
import GUI, { ColorController, Controller } from 'lil-gui';
import Instance from '../Core/Instance.js';

export function truncate(string, length, end = '...') {
    return string.length < length ? string : string.substring(0, length - end.length) + end;
}

/**
 * Base class for the panels in the inspector.
 *
 * @api
 * @abstract
 */
class Panel {
    /**
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {string} name The name of the panel.
     * @abstract
     */
    constructor(parentGui, instance, name) {
        this.gui = parentGui.addFolder(name);
        this.gui.close();
        this.instance = instance;

        /**
         * The controllers.
         *
         * @type {Controller[]}
         * @api
         */
        this._controllers = [];
    }

    notify(source = undefined) {
        this.instance.notifyChange(source);
    }

    collapse() {
        this.gui.close();
    }

    /**
     * Adds a color controller to the panel.
     *
     * @api
     * @param {object} obj The object.
     * @param {string} prop The name of the property.
     * @returns {ColorController} The created controller.
     */
    addColorController(obj, prop) {
        const controller = this.gui.addColor(obj, prop);
        this._controllers.push(controller);
        return controller;
    }

    /**
     * Adds a (non-color) controller to the panel.
     * See [the lil-gui API](https://lil-gui.georgealways.com/#GUI#add) for more information.
     *
     * @api
     * @param {object} obj The object.
     * @param {string} prop The name of the property.
     * @param {object|number|any[]|undefined} [$1=undefined] Minimum value for number controllers,
     * or the set of selectable values for a dropdown.
     * @param {number|undefined} [max=undefined] Maximum value for number controllers.
     * @param {number|undefined} [step=undefined] Step value for number controllers.
     * @returns {Controller} The created controller.
     */
    addController(obj, prop, $1, max, step) {
        const controller = this.gui.add(obj, prop, $1, max, step);
        this._controllers.push(controller);
        return controller;
    }

    /**
     * Updates all controllers in this panel with the observed values.
     * This is useful if the value changes from outside the GUI.
     *
     * @api
     */
    updateControllers() {
        this.updateValues();
        this._controllers.forEach(c => c.updateDisplay());
    }

    /**
     * Updates the values of the controller sources.
     *
     * @api
     */
    // eslint-disable-next-line class-methods-use-this
    updateValues() { }

    /**
     * Updates the panel. You may override this function if the panel has additional work to do.
     * However, {@link updateControllers()} should still be called to ensure they are up to date.
     *
     * @api
     */
    update() {
        if (!this.gui._closed) {
            this.updateControllers();
        }
    }

    /**
     * Removes this panel from its parent GUI.
     *
     * @api
     */
    dispose() {
        this.gui.destroy();
    }
}

export default Panel;
