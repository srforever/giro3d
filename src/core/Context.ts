/** @module core/Context */

import { Plane, Vector3 } from 'three';
import type Camera from '../renderer/Camera';
import type Instance from './Instance.js';

/**
 * Contains the render/update loop context.
 * Each {@link entities.Entity} being updated is given a
 * context in its update methods.
 * This context can be modified by entities (notably the near and far clipping planes).
 */
class Context {
    /**
     * The active camera.
     */
    public camera: Camera;
    /**
     * The giro3d instance
     */
    public instance: Instance;
    /**
     * Contains clipping plane distances.
     *
     * @type {object}
     * @property plane the plane that is normal to the line of sight.
     * @property min the minimum distance to the camera
     * @property max the maximum distance to the camera
     */
    public distance: { plane: Plane, min: number, max: number };
    // note ignoring this at the moment because we are really not sure of its usefulness.
    /**
     * Attribute allowing processing code to remember whether they
     * did a full update (in which case the value is `undefined`)
     * or a partial update and to act accordingly.
     *
     * @ignore
     */
    public fastUpdateHint: any;

    /**
     * Constructs a context.
     *
     * @param camera the active camera.
     * @param instance the giro3d instance.
     */
    constructor(camera: Camera, instance: Instance) {
        this.camera = camera;
        this.instance = instance;
        this.distance = {
            plane: new Plane()
                .setFromNormalAndCoplanarPoint(
                    camera.camera3D.getWorldDirection(new Vector3()),
                    camera.camera3D.position, /* TODO matrixWorld */
                ),
            min: Infinity,
            max: 0,
        };

        this.fastUpdateHint = undefined;
    }
}

export default Context;
