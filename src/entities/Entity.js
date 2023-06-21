/**
 * @module entities/Entity
 */

import { EventDispatcher } from 'three';
import EventUtils from '../utils/EventUtils.js';

/* eslint no-unused-vars: 0 */
/* eslint class-methods-use-this: 0 */

/**
 * Abstract base class for all entities in giro3d.
 * The Entity is the core component of giro3d and represent an updatable
 * object that is added to an {@link module:Core/Instance~Instance Instance}.
 *
 * The class inherits three.js' [`EventDispatcher`](https://threejs.org/docs/index.html?q=even#api/en/core/EventDispatcher).
 *
 * ### Lifetime
 *
 * The lifetime of an entity follows this pattern: when the entity is added to an instance, its
 * {@link module:entities/Entity~Entity#preprocess preprocess()} method is called. When the promise
 * returned by this method resolves, the entity can be used in the main loop, where the update
 * methods (see below) will be used to update the entity over time. Finally, when the entity is
 * removed from the instance, its {@link module:entities/Entity~Entity#dispose dispose()} method
 * is called to cleanup memory.
 *
 * ### The update methods
 *
 * This class exposes three methods to update the object:
 * - {@link module:entities/Entity~Entity#preUpdate preUpdate()}
 * to determine which _parts_ of the object should actually be updated.
 * - {@link module:entities/Entity~Entity#update update()} called for each part returned
 * by `preUpdate()`
 * - {@link module:entities/Entity~Entity#postUpdate postUpdate()} to finalize
 * the update step.
 *
 * ### A note on "parts"
 *
 * The notion of "part to be updated" is entity-specific. For example, if the entity is a tiled map,
 * the parts may be map tiles. If the entity is a point cloud, it may be point clusters, and so on.
 * On the other hand, if the entity is not made of distinct objects, the "part to update" may be the
 * entity itself, or a dummy object.
 *
 * @example
 *     const instance = new Instance(...);
 *     const entity = new Entity('exampleEntity');
 *     instance.add(entity);
 * @api
 */
class Entity extends EventDispatcher {
    /**
     * Creates an entity with the specified unique identifier.
     *
     *
     * @api
     * @param {string} id the unique identifier of this entity.
     */
    constructor(id) {
        super();
        if (!id) {
            throw new Error('Missing id parameter (Entity must have a unique id defined)');
        }

        this._id = id;
        this._frozen = false;
    }

    /**
     * Gets the unique identifier of this entity.
     *
     * @api
     * @type {string}
     */
    get id() {
        return this._id;
    }

    /**
     * Gets or sets the frozen status of this entity. A frozen entity is still visible
     * but will not be updated automatically.
     *
     * Useful for debugging purposes.
     *
     * @api
     * @type {boolean}
     */
    get frozen() {
        return this._frozen;
    }

    set frozen(v) {
        if (this._frozen !== v) {
            const event = EventUtils.createPropertyChangedEvent(this, 'frozen', this._frozen, v);
            this._frozen = v;
            this.dispatchEvent(event);
        }
    }

    /**
     * Gets whether this entity is currently loading data.
     *
     * @api
     * @type {boolean}
     */
    get loading() {
        // Implement this in derived classes.
        return false;
    }

    /**
     * Gets the current loading progress (between 0 and 1).
     * Note: This property is only meaningful if {@link loading} is `true`.
     *
     * @api
     * @type {number}
     */
    get progress() {
        // Implement this in derived classes.
        return 1;
    }

    /**
     * Asynchronously preprocess the entity. This method may be overriden to perform
     * any operation that must be done before the entity can be used in the scene, such
     * as fetching metadata about a dataset, etc.
     *
     * @api
     * @returns {Promise} A promise that resolves when the entity is ready to be used.
     */
    preprocess() {
        return Promise.resolve();
    }

    /**
     * This method is called just before `update()` to filter and select
     * which _elements_ should be actually updated. For example, in the
     * case of complex entities made of a hierarchy of elements, the entire
     * hierarchy may not need to be updated.
     *
     * Use this method to optimize the update step by reducing the number
     * of elements to process.
     *
     * Note: if this functions returns nothing, `update()` will not be called.
     *
     * @api
     * @param {module:Core/Context~Context} context the update context.
     * @param {Array<object>} changeSources the objects that triggered an update step.
     * This is useful to filter out unnecessary updates if no sources are
     * relevant to this entity. For example, if one of the sources is a
     * camera that moved during the previous frame, any entity that depends
     * on the camera's field of view should be updated.
     * @returns {Array<object>} the _elements_ to update during `update()`.
     */
    preUpdate(context, changeSources) { return null; }

    /**
     * Performs an update on an _element_ of the entity.
     *
     * Note: this method will be called for each element returned by `preUpdate()`.
     *
     * @api
     * @param {module:Core/Context~Context} context the update context.
     * This is the same object that the entity whose `update()` is being called.
     * @param {object} element the element to update.
     * This is one of the elements returned by
     * {@link module:entities/Entity~Entity#preUpdate preUpdate()}.
     */
    update(context, element) {}

    /**
     * Method called after {@link module:entities/Entity~Entity#update update()}.
     *
     * @api
     * @param {module:Core/Context~Context} context the update context.
     * @param {Array<object>} changeSources the objects that triggered an update step.
     * This is useful to filter out unnecessary updates if no sources are
     * relevant to this entity. For example, if one of the sources is a
     * camera that moved during the previous frame, any entity that depends
     * on the camera's field of view should be updated.
     */
    postUpdate(context, changeSources) {}

    /**
     * Disposes this entity and all resources associated with it.
     *
     * The default implementation of this method does nothing.
     * You should implement it in your custom entities to handle any special logic of disposal.
     *
     * For example: disposing materials, geometries, stopping HTTP requests, etc.
     *
     * @api
     */
    dispose() {}
}

export default Entity;
