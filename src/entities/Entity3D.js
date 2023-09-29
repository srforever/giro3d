/**
 * @module entities/Entity3D
 */
import {
    Box3,
    Material,
    Mesh,
    Object3D,
    Plane,
} from 'three';

import Picking from '../core/Picking.js';
import Entity from './Entity.js';
import EventUtils from '../utils/EventUtils.js';

/**
 * Fired when the entity visibility changed.
 *
 * @event Entity3D#visible-property-changed
 * @property {object} new the new value of the property
 * @property {boolean} new.visible the new value of the entity visibility
 * @property {object} previous the previous value of the property
 * @property {boolean} previous.visible the previous value of the entity visibility
 * @property {Entity3D} target dispatched on entity
 * @property {string} type visible-property-changed
 */

/**
 * Fired when the entity opacity changed.
 *
 * @event Entity3D#opacity-property-changed
 * @property {object} new the new value of the property
 * @property {number} new.opacity the new value of the entity opacity
 * @property {object} previous the previous value of the property
 * @property {number} previous.opacity the previous value of the entity opacity
 * @property {Entity3D} target dispatched on entity
 * @property {string} type opacity-property-changed
 */

/**
 * Base class for {@link entities.Entity entities} that display 3D objects.
 *
 * @fires Entity3D#opacity-property-changed
 * @fires Entity3D#visible-property-changed
 * @fires Entity3D#clippingPlanes-property-changed
 */
class Entity3D extends Entity {
    /**
     * Creates a Entity3D with the specified parameters.
     *
     * @param {string} id the unique identifier of this entity
     * @param {module:three.Object3D} object3d the root Three.js of this entity
     */
    constructor(id, object3d) {
        super(id);
        if (!object3d || !object3d.isObject3D) {
            throw new Error(
                'Missing/Invalid object3d parameter (must be a three.js Object3D instance)',
            );
        }
        this._attachedLayers = [];
        this._instance = null; // will be filled when we add the object to an instance

        if (object3d && object3d.type === 'Group' && object3d.name === '') {
            object3d.name = id;
        }

        /**
         * Read-only flag to check if a given object is of type Entity3D.
         *
         * @type {boolean}
         */
        this.isEntity3D = true;
        this.type = 'Entity3D';
        /** @type {boolean} */
        this._visible = true;
        /** @type {number} */
        this._opacity = 1;
        /** @type {Object3D} */
        this._object3d = object3d;

        // processing can overwrite that with values calculating from this layer's Object3D
        this._distance = { min: Infinity, max: 0 };

        /** @type {Plane[]} */
        this._clippingPlanes = null;

        this._renderOrder = 0;
    }

    /**
     * Returns the root object of this entity.
     *
     * @type {Object3D}
     */
    get object3d() {
        return this._object3d;
    }

    /**
     * Gets or sets the visibility of this entity.
     * A non-visible entity will not be automatically updated.
     *
     * @type {boolean}
     * @fires Entity3D#visible-property-changed
     */
    get visible() {
        return this._visible;
    }

    set visible(v) {
        if (this._visible !== v) {
            const event = EventUtils.createPropertyChangedEvent(this, 'visible', this._visible, v);
            this._visible = v;
            this.updateVisibility();
            this.dispatchEvent(event);
        }
    }

    /**
     * Gets or sets the render order of this entity.
     *
     * @type {number}
     * @fires Entity3D#renderOrder-property-changed
     */
    get renderOrder() {
        return this._renderOrder;
    }

    set renderOrder(v) {
        if (v !== this._renderOrder) {
            const event = EventUtils.createPropertyChangedEvent(this, 'renderOrder', this._renderOrder, v);
            this._renderOrder = v;
            this.traverse(o => { o.renderOrder = v; });
            this.dispatchEvent(event);
        }
    }

    /**
     * Gets or sets the opacity of this entity.
     *
     * @type {number}
     * @fires Entity3D#opacity-property-changed
     */
    get opacity() {
        return this._opacity;
    }

    set opacity(v) {
        if (this._opacity !== v) {
            const event = EventUtils.createPropertyChangedEvent(this, 'opacity', this._opacity, v);
            this._opacity = v;
            this.updateOpacity();
            this.dispatchEvent(event);
        }
    }

    /**
     * Gets or sets the clipping planes set on this entity. Default is `null` (no clipping planes).
     *
     * Note: custom entities must ensure that the materials and shaders used do support
     * the [clipping plane feature](https://threejs.org/docs/index.html?q=materi#api/en/materials/Material.clippingPlanes) of three.js.
     * Refer to the three.js documentation for more information.
     *
     * @type {Plane[]}
     * @fires Entity3D#clippingPlanes-property-changed
     */
    get clippingPlanes() {
        return this._clippingPlanes;
    }

    set clippingPlanes(planes) {
        const event = EventUtils.createPropertyChangedEvent(this, 'clippingPlanes', this._clippingPlanes, planes);
        this._clippingPlanes = planes;
        this.updateClippingPlanes();
        this.dispatchEvent(event);
    }

    /**
     * Updates the visibility of the entity.
     * Note: this method can be overriden for custom implementations.
     *
     */
    updateVisibility() {
        // Default implementation
        if (this.object3d) {
            this.object3d.visible = this.visible;
        }
    }

    /**
     * Updates the opacity of the entity.
     * Note: this method can be overriden for custom implementations.
     *
     */
    updateOpacity() {
        // Default implementation
        this.traverseMaterials(material => {
            if (material.opacity != null) {
                // != null: we want the test to pass if opacity is 0
                const currentTransparent = material.transparent;
                material.transparent = this.opacity < 1.0;
                material.needsUpdate = (currentTransparent !== material.transparent);
                material.opacity = this.opacity;
            }
        });
    }

    /**
     * Updates the clipping planes of all objects under this entity.
     */
    updateClippingPlanes() {
        this.traverseMaterials(mat => { mat.clippingPlanes = this._clippingPlanes; });
    }

    postUpdate() {
        this._attachedLayers.forEach(layer => layer.postUpdate());
    }

    /**
     * Returns an approximated bounding box of this entity in the scene.
     *
     * @returns {Box3|null} the resulting bounding box, or `null` if it could not be computed.
     */
    getBoundingBox() {
        if (this.object3d) {
            const box = new Box3().setFromObject(this.object3d);
            return box;
        }

        return null;
    }

    /**
     * Applies entity-level setup on a new object.
     *
     * Note: this method should be called from the subclassed entity to notify the parent
     * class that a new 3D object has just been created, so that it can be setup with entity-wide
     * parameters.
     *
     * @example
     * // In the subclass
     * const obj = new Object3D();
     *
     * // Notify the parent class
     * this.onObjectCreated(obj);
     * @param {Object3D} obj The object to prepare.
     */
    onObjectCreated(obj) {
        // note: we use traverse() because the object might have its own sub-hierarchy as well.

        this.traverse(o => {
            // To be able to link an object to its parent entity (e.g for picking purposes)
            o.userData.parentEntity = this;
        }, obj);

        // Setup materials
        this.traverseMaterials(material => {
            material.clippingPlanes = this._clippingPlanes;
            material.opacity = this._opacity;
            if (material.opacity < 1.0) {
                material.transparent = true;
            }
        }, obj);
    }

    /* eslint-disable class-methods-use-this */
    /**
     * Attached layers expect to receive the visual representation of a layer (= THREE object
     * with a material).  So if a layer's update function don't process this kind of object, the
     * layer must provide a getObjectToUpdateForAttachedLayers function that returns the correct
     * object to update for attached layer from the objects returned by preUpdate.
     *
     * @param {object} obj the Mesh or the object containing a Mesh. These are the objects returned
     * by preUpdate or update.
     * @returns {object} an object passed to the update function of attached layers.
     */
    getObjectToUpdateForAttachedLayers(obj) {
        if (!obj.parent || !obj.material) {
            return null;
        }
        return {
            element: obj,
            parent: obj.parent,
        };
    }
    /* eslint-enable class-methods-use-this */

    /**
     * Picks objects given a position and a radius from the layer.
     *
     * @param {object} coordinates The x/y position in the layer
     * @param {object} [options] Optional properties. See Instance.pickObjectsAt
     * @param {object[]} [target=undefined] Target array to fill
     * @returns {object[]} Picked objects (node)
     */
    pickObjectsAt(coordinates, options, target) {
        return Picking.pickObjectsAt(
            this._instance,
            coordinates,
            this.object3d,
            options,
            target,
        );
    }

    /**
     * Test whether this entity contains the given object.
     *
     * The object may be a component of the entity, or a 3D object.
     *
     * @param {any} obj The object to test.
     * @returns {boolean} true if the entity contains the object.
     */
    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    contains(obj) { return false; }

    attach(layer) {
        if (!layer.update) {
            throw new Error(`Missing 'update' function -> can't attach layer ${layer.id}`);
        }
        layer = layer._preprocessLayer(this._instance);

        this._attachedLayers.push(layer);
    }

    detach(layer) {
        const count = this._attachedLayers.length;
        this._attachedLayers = this._attachedLayers.filter(attached => attached.id !== layer.id);
        return this._attachedLayers.length < count;
    }

    /**
     * Get all the layers attached to this object.
     *
     * @param {function(module:Core/Layer~Layer):boolean} filter
     * Optional filter function for attached layers
     * @returns {Array<module:Core/Layer~Layer>} the layers attached to this object
     */
    getLayers(filter) {
        const result = [];
        for (const attached of this._attachedLayers) {
            if (!filter || filter(attached)) {
                result.push(attached);
            }
        }
        return result;
    }

    /**
     * Traverses all materials in the hierarchy of this entity.
     *
     * @param {function(Material): void} callback The callback.
     * @param {Object3D} [root] The traversal root. If undefined, the traversal starts at the root
     * object of this entity.
     */
    traverseMaterials(callback, root = undefined) {
        this.traverse(o => {
            if (Array.isArray(o.material)) {
                o.material.forEach(m => callback(m));
            } else if (o.material) {
                callback(o.material);
            }
        }, root);
    }

    /**
     * Traverses all meshes in the hierarchy of this entity.
     *
     * @param {function(Mesh): void} callback The callback.
     * @param {Object3D} [root] The raversal root. If undefined, the traversal starts at the root
     * object of this entity.
     */
    traverseMeshes(callback, root = undefined) {
        const origin = root ?? this.object3d;

        if (origin) {
            origin.traverse(o => {
                if (o.isMesh) {
                    callback(o);
                }
            });
        }
    }

    /**
     * Traverses all objects in the hierarchy of this entity.
     *
     * @param {function(Object3D): void} callback The callback.
     * @param {Object3D} [root] The traversal root. If undefined, the traversal starts at the root
     * object of this entity.
     */
    traverse(callback, root = undefined) {
        const origin = root ?? this.object3d;

        if (origin) {
            origin.traverse(callback);
        }
    }
}

export default Entity3D;
