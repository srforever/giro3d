import {
    Box3,
    type Vector2,
    type Material,
    type Mesh,
    type Object3D,
    type Plane,
} from 'three';

import Picking, { type PickObjectsAtOptions, type PickObjectsAtResult } from '../core/Picking';
import Entity, { type EntityEventMap } from './Entity';
import type Instance from '../core/Instance.js';
import type Layer from '../core/layer/Layer.js';

export interface Entity3DEventMap extends EntityEventMap {
    /**
     * Fired when the entity opacity changed.
     */
    'opacity-property-changed': { opacity: number; }
    /**
     * Fired when the entity visibility changed.
     */
    'visible-property-changed': { visible: boolean; }
    /**
     * Fired when the entity's clipping planes have changed.
     */
    'clippingPlanes-property-changed': { clippingPlanes: Plane[]; }
    /**
     * Fired when the entity render order changed.
     */
    'renderOrder-property-changed': { renderOrder: number; }
}

/**
 * Base class for {@link entities.Entity entities} that display 3D objects.
 *
 * Subclasses *must* call `onObjectCreated` when creating new Object3D, before adding them to the
 * scene
 */
class Entity3D<TEventMap extends Entity3DEventMap = Entity3DEventMap>
    extends Entity<TEventMap & Entity3DEventMap> {
    protected _instance: Instance;
    protected _attachedLayers: Layer[];
    private _visible: boolean;
    private _opacity: number;
    private _object3d: Object3D;
    protected _distance: { min: number; max: number; };
    private _clippingPlanes: Plane[];
    private _renderOrder: number;

    /**
     * Read-only flag to check if a given object is of type Entity3D.
     */
    readonly isEntity3D: boolean = true;

    /**
     * Creates a Entity3D with the specified parameters.
     *
     * @param id the unique identifier of this entity
     * @param object3d the root Three.js of this entity
     */
    constructor(id: string, object3d: Object3D) {
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

        this.type = 'Entity3D';
        this._visible = true;
        this._opacity = 1;
        this._object3d = object3d;

        // processing can overwrite that with values calculating from this layer's Object3D
        this._distance = { min: Infinity, max: 0 };

        this._clippingPlanes = null;

        this._renderOrder = 0;
    }

    /**
     * The layers attached to this entity.
     */
    get attachedLayers() {
        return this._attachedLayers;
    }

    /**
     * Returns the root object of this entity.
     */
    get object3d() {
        return this._object3d;
    }

    /**
     * Gets or sets the visibility of this entity.
     * A non-visible entity will not be automatically updated.
     *
     * @fires Entity3D#visible-property-changed
     */
    get visible() {
        return this._visible;
    }

    set visible(v) {
        if (this._visible !== v) {
            this._visible = v;
            this.updateVisibility();
            this.dispatchEvent({ type: 'visible-property-changed', visible: v });
        }
    }

    /**
     * Gets or sets the render order of this entity.
     *
     * @fires Entity3D#renderOrder-property-changed
     */
    get renderOrder() {
        return this._renderOrder;
    }

    set renderOrder(v: number) {
        if (v !== this._renderOrder) {
            this._renderOrder = v;
            this.traverse(o => { o.renderOrder = v; });
            this.dispatchEvent({ type: 'renderOrder-property-changed', renderOrder: v });
        }
    }

    /**
     * Gets or sets the opacity of this entity.
     *
     * @fires Entity3D#opacity-property-changed
     */
    get opacity() {
        return this._opacity;
    }

    set opacity(v) {
        if (this._opacity !== v) {
            this._opacity = v;
            this.updateOpacity();
            this.dispatchEvent({ type: 'opacity-property-changed', opacity: v });
        }
    }

    /**
     * Gets or sets the clipping planes set on this entity. Default is `null` (no clipping planes).
     *
     * Note: custom entities must ensure that the materials and shaders used do support
     * the [clipping plane feature](https://threejs.org/docs/index.html?q=materi#api/en/materials/Material.clippingPlanes) of three.js.
     * Refer to the three.js documentation for more information.
     *
     * @fires Entity3D#clippingPlanes-property-changed
     */
    get clippingPlanes() {
        return this._clippingPlanes;
    }

    set clippingPlanes(planes: Plane[]) {
        this._clippingPlanes = planes;
        this.updateClippingPlanes();
        this.dispatchEvent({ type: 'clippingPlanes-property-changed', clippingPlanes: planes });
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
     * @returns the resulting bounding box, or `null` if it could not be computed.
     */
    getBoundingBox(): Box3 | null {
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
     * @param obj The object to prepare.
     */
    onObjectCreated(obj: Object3D) {
        // note: we use traverse() because the object might have its own sub-hierarchy as well.

        this.traverse(o => {
            // To be able to link an object to its parent entity (e.g for picking purposes)
            o.userData.parentEntity = this;
            o.renderOrder = this.renderOrder;
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
     * @param obj the Mesh or the object containing a Mesh. These are the objects returned
     * by preUpdate or update.
     * @returns an object passed to the update function of attached layers.
     */
    getObjectToUpdateForAttachedLayers(obj: Mesh) {
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
     * @param coordinates The x/y position in the layer
     * @param options Optional properties. See Instance.pickObjectsAt
     * @param target Target array to fill
     * @returns Picked objects (node)
     */
    pickObjectsAt(
        coordinates: Vector2,
        options?: PickObjectsAtOptions,
        target?: PickObjectsAtResult[],
    ) {
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
     * @param obj The object to test.
     * @returns true if the entity contains the object.
     */
    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
    contains(obj: unknown): boolean { return false; }

    attach(layer: Layer) {
        if (!layer.update) {
            throw new Error(`Missing 'update' function -> can't attach layer ${layer.id}`);
        }
        layer = layer._preprocessLayer(this._instance);

        this._attachedLayers.push(layer);
    }

    detach(layer: Layer) {
        const count = this._attachedLayers.length;
        this._attachedLayers = this._attachedLayers.filter(attached => attached.id !== layer.id);
        return this._attachedLayers.length < count;
    }

    /**
     * Get all the layers attached to this object.
     *
     * @param filter Optional filter function for attached layers
     * @returns the layers attached to this object
     */
    getLayers(filter: (arg0: Layer) => boolean): Layer[] {
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
     * @param callback The callback.
     * @param root The traversal root. If undefined, the traversal starts at the root
     * object of this entity.
     */
    traverseMaterials(callback: (arg0: Material) => void, root: Object3D = undefined) {
        this.traverse((o: any) => {
            if (Array.isArray(o.material)) {
                o.material.forEach((m: Material) => callback(m));
            } else if (o.material) {
                callback(o.material as Material);
            }
        }, root);
    }

    /**
     * Traverses all meshes in the hierarchy of this entity.
     *
     * @param callback The callback.
     * @param root The raversal root. If undefined, the traversal starts at the root
     * object of this entity.
     */
    traverseMeshes(callback: (arg0: Mesh) => void, root: Object3D = undefined) {
        const origin = root ?? this.object3d;

        if (origin) {
            origin.traverse(o => {
                if ((o as Mesh).isMesh) {
                    callback(o as Mesh);
                }
            });
        }
    }

    /**
     * Traverses all objects in the hierarchy of this entity.
     *
     * @param callback The callback.
     * @param root The traversal root. If undefined, the traversal starts at the root
     * object of this entity.
     */
    traverse(callback: (arg0: Object3D) => void, root: Object3D = undefined) {
        const origin = root ?? this.object3d;

        if (origin) {
            origin.traverse(callback);
        }
    }
}

export default Entity3D;
