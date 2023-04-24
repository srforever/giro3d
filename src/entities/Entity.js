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
 *
 *     const instance = new Instance(...);
 *     const entity = new Entity('exampleEntity');
 *     instance.add(entity);
 *
 * The class inherits three.js' [`EventDispatcher`](https://threejs.org/docs/index.html?q=even#api/en/core/EventDispatcher).
 *
 * @api
 */
class Entity extends EventDispatcher {
    /**
     * Creates an entity with the specified unique identifier.
     *
     * This class exposes three methods to update the object:
     *
     * - {@link module:entities/Entity~Entity#preUpdate preUpdate()}
     * to determine which part of the object should actually be updated.
     * - {@link module:entities/Entity~Entity#update update()} to update the
     * parts returned by `preUpdate()`
     * - {@link module:entities/Entity~Entity#postUpdate postUpdate()} to finalize
     * the update step.
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
