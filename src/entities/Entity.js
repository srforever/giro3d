/**
 * @module entities/Entity
 */

import { EventDispatcher } from 'three';

/* eslint class-methods-use-this: 0 */

/**
 * Abstract base class for all entities in giro3d.
 * The Entity is the core component of giro3d and represent an updatable
 * object that is added to an {@link module:Core/Instance~Instance Instance}.
 *
 * Derived implementations can use the `update`, `preUpdate` and `postUpdate` methods
 * to update their state.
 *
 *     const instance = new giro3d.Instance(...);
 *     const entity = new giro3d.Entity('exampleEntity');
 *     instance.add(entity);
 *
 * @api
 */
class Entity extends EventDispatcher {
    constructor(id) {
        super();

        if (!id) {
            throw new Error('Missing id parameter (Entity must have a unique id defined)');
        }

        Object.defineProperty(this, 'id', {
            value: id,
            writable: false,
        });
    }

    /**
     * Method called _before_ all other
     * {@link module:Entity~Entity#update} have been called.
     *
     * @api
     */
    preUpdate() {}

    /**
     * Updates the object. Its exact semantics depend on
     * the concrete implementation of the entity.
     * For example, if this entity's visual state depends on the current
     * view,`update()` may load the required data to fit the view.
     *
     * @api
     */
    update() {}

    /**
     * Method called _after_ all other
     * {@link module:Entity~Entity#update} have been called.
     *
     * @api
     */
    postUpdate() {}
}

export default Entity;
