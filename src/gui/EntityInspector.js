/**
 * @module gui/EntityInspector
 */
import GUI from 'lil-gui';
import {
    Object3D,
    Color,
    Plane,
    Vector3,
    PlaneHelper,
} from 'three';
import Panel from './Panel.js';
import Instance from '../core/Instance.js';
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

class ClippingPlanePanel extends Panel {
    constructor(entity, parentGui, instance) {
        super(parentGui, instance, 'Clipping plane');

        this.entity = entity;

        this.enableClippingPlane = false;
        this.normal = new Vector3(0, 0, 1);
        this.distance = 0;
        this.helperSize = 5;
        this.negate = false;

        this.addController(this, 'enableClippingPlane')
            .name('Enable')
            .onChange(() => this.updateClippingPlane());

        this.addController(this.normal, 'x').name('Plane normal X').onChange(() => this.updateClippingPlane());
        this.addController(this.normal, 'y').name('Plane normal Y').onChange(() => this.updateClippingPlane());
        this.addController(this.normal, 'z').name('Plane normal Z').onChange(() => this.updateClippingPlane());
        this.addController(this, 'distance').name('Distance').onChange(() => this.updateClippingPlane());
        this.addController(this, 'helperSize').name('Helper size').onChange(() => this.updateClippingPlane());
        this.addController(this, 'negate').name('Negate plane').onChange(() => this.updateClippingPlane());
    }

    updateClippingPlane() {
        this.planeHelper?.removeFromParent();
        this.planeHelper?.dispose();

        if (this.enableClippingPlane) {
            const plane = new Plane(this.normal.clone(), this.distance);
            if (this.negate) {
                plane.negate();
            }
            this.entity.clippingPlanes = [plane];
            this.planeHelper = new PlaneHelper(plane, this.helperSize, 0xff0000);
            this.planeHelper.name = `Clipping plane for ${this.entity.id}`;
            this.instance.scene.add(this.planeHelper);
            this.planeHelper.updateMatrixWorld();
        } else {
            this.entity.clippingPlanes = null;
        }
        this.notify(this.entity);
    }

    dispose() {
        this.planeHelper?.removeFromParent();
        this.planeHelper?.dispose();
    }
}

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
        this.state = 'idle';

        this.addController(this.entity, 'id').name('Identifier');

        this.addController(this, 'state').name('Status');
        this.addController(this.entity, 'renderOrder', 0, 10, 1)
            .name('Render order')
            .onChange(() => this.notify(this.entity));

        this.clippingPlanePanel = new ClippingPlanePanel(entity, this.gui, instance);

        if (options.visibility) {
            this.addController(this, 'visible').name('Visible').onChange(v => this.toggleVisibility(v));
        }
        this.addController(this.entity, 'frozen').onChange(() => this.notify(this.entity));
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

        this.addController(this, 'deleteEntity').name('Delete entity');
    }

    deleteEntity() {
        this.instance.remove(this.entity);
    }

    dispose() {
        this.toggleBoundingBoxes(false);
        this.clippingPlanePanel.dispose();
    }

    updateValues() {
        this.state = this.entity.loading ? `loading (${Math.round(this.entity.progress * 100)}%)` : 'idle';
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
