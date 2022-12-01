/**
 * @module gui/EntityInspector
 */
import GUI from 'lil-gui';
import { Object3D, Color } from 'three';
import Panel from './Panel.js';
import Instance from '../Core/Instance.js';
import Entity3D from '../entities/Entity3D.js';
import Helpers from '../helpers/Helpers.js';

const _tempArray = [];

/**
 * Traverses the object hierarchy exactly once per object,
 * even if the hierarchy is modified during the traversal.
 *
 * In other words, objects can be safely added
 * to the hierarchy without causing infinite recursion.
 *
 * @param {Function} callback The callback to call for each visited object.
 * @name Object3D#traverseOnce
 * @memberof Object3D
 */
Object3D.prototype.traverseOnce = function traverseOnce(callback) {
    this.traverse(o => _tempArray.push(o));

    while (_tempArray.length > 0) {
        callback(_tempArray.pop());
    }
};

/**
 * Base class for entity inspectors. To implement a custom inspector
 * for an entity type, you can inherit this class.
 *
 * @class EntityInspector
 * @augments {Panel}
 * @abstract
 * @api
 */
class EntityInspector extends Panel {
    /**
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {Entity3D} entity The entity to inspect.
     * @param {object} options The options.
     * @param {string} options.title The title to display in the inspector.
     * @param {boolean} options.boundingBoxes Display the bounding box checkbox.
     * @param {boolean} options.boundingBoxColor Display the bounding box color checkbox.
     * @param {boolean} options.opacity Display the opacity slider.
     * @param {boolean} options.visibility Display the visibility checkbox.
     */
    constructor(parentGui, instance, entity, options) {
        super(parentGui, instance, options.title);

        /**
         * The inspected entity.
         *
         * @type {Entity3D}
         * @api
         */
        this.entity = entity;

        /**
         * The root object of the entity's hierarchy.
         *
         * @type {Object3D}
         * @api
         */
        this.rootObject = entity.object3d;

        /**
         * Toggle the visibility of the entity.
         *
         * @type {boolean}
         * @api
         */
        this.visible = entity.visible;

        /**
         * Toggle the visibility of the bounding boxes.
         *
         * @type {boolean}
         * @api
         */
        this.boundingBoxes = false;

        this.boundingBoxColor = '#FFFF00';

        if (options.visibility) {
            this.addController(this, 'visible').name('Visible').onChange(v => this.toggleVisibility(v));
        }
        if (options.opacity) {
            this.addController(this.entity, 'opacity')
                .name('Opacity')
                .min(0)
                .max(1)
                .onChange(() => this.notify(this.entity));
        }
        if (options.boundingBoxes) {
            this.addController(this, 'boundingBoxes').name('Show volumes').onChange(v => this.toggleBoundingBoxes(v));
            if (options.boundingBoxColor) {
                this.addColorController(this, 'boundingBoxColor').name('Volume color').onChange(v => this.updateBoundingBoxColor(v));
            }
        }
    }

    dispose() {
        this.toggleBoundingBoxes(false);
    }

    updateValues() {
        if (this.boundingBoxes) {
            this.toggleBoundingBoxes(true);
        }
    }

    /**
     * Toggles the visibility of the entity in the scene.
     * You may override this method if the entity's visibility is not directly related
     * to its root object visibility.
     *
     * @api
     * @param {boolean} visible The new visibility.
     */
    toggleVisibility(visible) {
        this.entity.visible = visible;
        this.notify(this.entity);
    }

    /**
     * Toggles the visibility of the bounding boxes.
     * You may override this method to use custom bounding boxes.
     *
     * @api
     * @param {boolean} visible The new state.
     */
    toggleBoundingBoxes(visible) {
        const color = new Color(this.boundingBoxColor);
        // by default, adds axis-oriented bounding boxes to each object in the hierarchy.
        // custom implementations may override this to have a different behaviour.
        this.rootObject.traverseOnce(obj => this.addOrRemoveBoundingBox(obj, visible, color));
        this.notify(this.entity);
    }

    /**
     * @param {Object3D} obj The object to decorate.
     * @param {boolean} add If true, bounding box is added, otherwise it is removed.
     * @param {Color} color The bounding box color.
     */
    // eslint-disable-next-line class-methods-use-this
    addOrRemoveBoundingBox(obj, add, color) {
        if (add) {
            if (obj.visible && obj.material && obj.material.visible) {
                Helpers.addBoundingBox(obj, color);
            }
        } else {
            Helpers.removeBoundingBox(obj);
        }
    }

    updateBoundingBoxColor(colorHex) {
        const color = new Color(colorHex);
        this.rootObject.traverse(obj => {
            if (obj.volumeHelper) {
                obj.volumeHelper.material.color = color;
            }
        });

        this.notify(this.entity);
    }
}

export default EntityInspector;
