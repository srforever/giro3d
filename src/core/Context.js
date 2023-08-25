/** @module core/Context */

import { Plane, Vector3 } from 'three';

/**
 * Contains the render/update loop context.
 * Each {@link module:entities/Entity~Entity} being updated is given a
 * context in its update methods.
 * This context can be modified by entities (notably the near and far clipping planes).
 *
 * @api
 */
class Context {
    /**
     * Constructs a context.
     *
     * @param {module:Renderer/Camera~Camera} camera the active camera.
     * @param {module:Core/Instance~Instance} instance the giro3d instance.
     * @api
     */
    constructor(camera, instance) {
        /**
         * The active camera.
         *
         * @type {module:Renderer/Camera~Camera}
         * @api
         */
        this.camera = camera;
        /**
         * The giro3d instance
         *
         * @type {module:Core/Instance~Instance}
         * @api
         */
        this.instance = instance;
        /**
         * Contains clipping plane distances.
         *
         * @type {object}
         * @property {Plane} plane the plane that is normal to the line of sight.
         * @property {number} min the minimum distance to the camera
         * @property {number} max the maximum distance to the camera
         * @api
         */
        this.distance = {
            plane: new Plane()
                .setFromNormalAndCoplanarPoint(
                    camera.camera3D.getWorldDirection(new Vector3()),
                    camera.camera3D.position, /* TODO matrixWorld */
                ),
            min: Infinity,
            max: 0,
        };

        /**
         * Attribute allowing processing code to remember whether they
         * did a full update (in which case the value is `undefined`)
         * or a partial update and to act accordingly.
         *
         * @api
         */
        this.fastUpdateHint = undefined;
    }
}

export default Context;
