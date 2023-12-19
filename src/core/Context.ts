import { Plane, Vector3 } from 'three';
import type Camera from '../renderer/Camera';
import type Instance from './Instance';
import type Entity from '../entities/Entity';

/**
 * Contains the render/update loop context.
 * Each {@link Entity} being updated is given a
 * context in its update methods.
 * This context can be modified by entities (notably the near and far clipping planes).
 *
 */
class Context {
    /**
     * The active camera.
     */
    readonly camera: Camera;
    /**
     * The giro3d instance
     */
    readonly instance: Instance;

    /**
     * Contains clipping plane distances.
     */
    readonly distance: {
        /**  The plane that is normal to the line of sight. */
        plane: Plane;
        /** The minimum distance to the camera */
        min: number;
        /** The maximum distance to the camera */
        max: number;
    };

    /**
     * Attribute allowing processing code to remember whether they
     * did a full update (in which case the value is `undefined`)
     * or a partial update and to act accordingly.
     */
    fastUpdateHint: unknown;
    /** Current entity being updated. */
    entity: Entity;

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

    setForEntity(entity: Entity): void {
        this.fastUpdateHint = undefined;
        this.entity = entity;
    }
}

export default Context;
