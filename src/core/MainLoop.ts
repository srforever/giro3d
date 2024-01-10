import {
    EventDispatcher, MathUtils as ThreeMath, Sphere,
} from 'three';
import Context from './Context';
import type C3DEngine from '../renderer/c3DEngine';
import { MAIN_LOOP_EVENTS } from './MainLoopEvents';
import type Instance from './Instance';
import Entity from '../entities/Entity';
import type Layer from './layer/Layer';

/** Rendering state */
export enum RenderingState {
    /* Paused */
    RENDERING_PAUSED = 0,
    /* Scheduled */
    RENDERING_SCHEDULED = 1,
}

/** @deprecated Use {@link RenderingState} */
export const RENDERING_PAUSED = RenderingState.RENDERING_PAUSED;
/** @deprecated Use {@link RenderingState} */
export const RENDERING_SCHEDULED = RenderingState.RENDERING_SCHEDULED;

/** @deprecated Use {@link MainLoopFrameEvents} */
export { MAIN_LOOP_EVENTS };

const MIN_DISTANCE = 2;
const MAX_DISTANCE = 2000000000;

const tmpSphere = new Sphere();

/** Events supported by {@link MainLoop} */
export interface MainLoopEvents {
}

/** Options for creating the {@link MainLoop} */
export interface MainLoopOptions {
    maxFar?: number,
    minNear?: number;
}

/**
 * Objects to update from an entity.
 *
 * TODO: This is a mess and requires some clean-up.
 *
 * @ignore
 */
export interface ObjectToUpdate {
    element?: any,
    parent?: any,
    elements?: any[],
}

// TODO: clean this up
function updateElements(context: Context, entity: Entity, elements?: unknown[]) {
    if (!elements) {
        return;
    }
    for (const element of elements) {
        // update element
        // TODO find a way to notify attachedLayers when entity deletes some elements
        // and then update Debug.js:addGeometryLayerDebugFeatures
        const newElementsToUpdate = entity.update(context, element);

        const sub = entity.getObjectToUpdateForAttachedLayers(element);

        if (sub) {
            if (sub.element) {
                // @ts-ignore
                if (__DEBUG__) {
                    if (!(sub.element.isObject3D)) {
                        throw new Error(`
                            Invalid object for attached layer to update.
                            Must be a THREE.Object and have a THREE.Material`);
                    }
                }
                // update attached layers
                if ('attachedLayers' in entity) {
                    for (const attachedLayer of (entity.attachedLayers) as Layer[]) {
                        if (attachedLayer.ready) {
                            attachedLayer.update(context, sub.element);
                        }
                    }
                }
            } else if (sub.elements) {
                for (let i = 0; i < sub.elements.length; i++) {
                    if (!(sub.elements[i].isObject3D)) {
                        throw new Error(`
                            Invalid object for attached layer to update.
                            Must be a THREE.Object and have a THREE.Material`);
                    }
                    // update attached layers
                    if ('attachedLayers' in entity) {
                        for (const attachedLayer of (entity.attachedLayers) as Layer[]) {
                            if (attachedLayer.ready) {
                                attachedLayer.update(context, sub.elements[i]);
                            }
                        }
                    }
                }
            }
        }
        updateElements(context, entity, newElementsToUpdate);
    }
}

class MainLoop extends EventDispatcher<MainLoopEvents> {
    private _renderingState: RenderingState;
    public get renderingState(): RenderingState {
        return this._renderingState;
    }
    private _needsRedraw: boolean;
    private readonly _gfxEngine: C3DEngine;
    /**
     * @deprecated - Use {@link Instance#engine Instance.engine}
     */
    public get gfxEngine(): C3DEngine {
        return this._gfxEngine;
    }
    private _updateLoopRestarted: boolean;
    private _maxFar: number;
    private _minNear: number;
    private _lastTimestamp: number;
    private readonly _changeSources: Set<unknown>;

    constructor(engine: C3DEngine, options: MainLoopOptions = {}) {
        super();
        this._renderingState = RenderingState.RENDERING_PAUSED;
        this._needsRedraw = false;
        this._gfxEngine = engine; // TODO: remove me
        this._updateLoopRestarted = true;
        this._maxFar = options.maxFar ?? MAX_DISTANCE;
        this._minNear = options.minNear ?? MIN_DISTANCE;
        this._lastTimestamp = 0;
        this._changeSources = new Set<unknown>();
    }

    scheduleUpdate(
        instance: Instance,
        forceRedraw: boolean,
        changeSource: unknown = undefined,
    ) {
        if (changeSource) {
            this._changeSources.add(changeSource);
        }
        this._needsRedraw = this._needsRedraw || forceRedraw;

        if (this._renderingState !== RenderingState.RENDERING_SCHEDULED) {
            this._renderingState = RenderingState.RENDERING_SCHEDULED;

            requestAnimationFrame(timestamp => { this._step(instance, timestamp); });
        }
    }

    private _update(instance: Instance, updateSources: Set<unknown>, dt: number) {
        const context = new Context(instance.camera, instance);

        // Reset near/far to default value to allow update function to test
        // visibility using camera's frustum; without depending on the near/far
        // values which are only used for rendering.
        instance.camera.camera3D.near = this._minNear;
        instance.camera.camera3D.far = this._maxFar;
        // We can't just use camera3D.updateProjectionMatrix() because part of
        // the update process use camera._viewMatrix, and this matrix depends
        // on near/far values.
        instance.camera.update();

        for (const entity of instance.getObjects(o => o instanceof Entity) as Entity[]) {
            context.resetForEntity(entity);
            if (entity.shouldCheckForUpdate()) {
                instance.execFrameRequesters(
                    'before_layer_update', dt, this._updateLoopRestarted, entity,
                );

                // Filter updateSources that are relevant for the entity
                const srcs = entity.filterChangeSources(updateSources);
                if (srcs.size > 0) {
                    // `preUpdate` returns an array of elements to update
                    const elementsToUpdate = entity.preUpdate(context, srcs);
                    // `update` is called in `updateElements`.
                    updateElements(context, entity, elementsToUpdate);
                    // `postUpdate` is called when this geom layer update process is finished
                    entity.postUpdate(context, updateSources);
                }

                if ('distance' in entity) {
                    const entityDistance = entity.distance as { min: number; max: number; };
                    context.distance.min = Math.min(context.distance.min, entityDistance.min);
                    if (entityDistance.max === Infinity) {
                        context.distance.max = this._maxFar;
                    } else {
                        context.distance.max = Math.max(
                            context.distance.max, entityDistance.max,
                        );
                    }
                }
                instance.execFrameRequesters(
                    'after_layer_update', dt, this._updateLoopRestarted, entity,
                );
            }
        }

        // TODO document the fact Object3D must be added through threeObjects
        // if they want to influence the near / far planes
        instance.threeObjects.traverse(o => {
            if (!o.visible) {
                return;
            }
            const boundingSphere = ((o as any)?.geometry as any)?.boundingSphere as Sphere;
            if (boundingSphere && !boundingSphere.isEmpty()) {
                tmpSphere.copy(boundingSphere);
                tmpSphere.applyMatrix4(o.matrixWorld);
                const d = tmpSphere.distanceToPoint(context.camera.camera3D.position);
                context.distance.min = ThreeMath.clamp(d, 0, context.distance.min);

                context.distance.max = Math.max(context.distance.max, d + 2 * tmpSphere.radius);
            }
        });

        let minDistance = context.distance.min;
        if (instance.camera.camera3D.isPerspective) {
            // NOTE: if the object responsible of this value of minDistance is near one
            // end of the field of instance, the near plane must be at near = minDistance *
            // cos(fov)
            const cos = Math.cos(ThreeMath.degToRad(instance.camera.camera3D.fov / 2));
            minDistance *= minDistance * cos;
        }
        // clamp it to minNear / maxFar
        minDistance = minDistance === Infinity
            ? this._minNear : ThreeMath.clamp(minDistance, this._minNear, this._maxFar);
        instance.camera.camera3D.near = minDistance;

        const far = context.distance.max === 0
            ? this._maxFar : ThreeMath.clamp(context.distance.max, minDistance, this._maxFar);
        instance.camera.camera3D.far = far;

        instance.camera.update();
    }

    private _step(instance: Instance, timestamp: number) {
        const dt = timestamp - this._lastTimestamp;

        instance.execFrameRequesters('update_start', dt, this._updateLoopRestarted);

        const willRedraw = this._needsRedraw;
        this._lastTimestamp = timestamp;

        // Reset internal state before calling _update (so future calls to Instance.notifyChange()
        // can properly change it)
        this._needsRedraw = false;
        this._renderingState = RenderingState.RENDERING_PAUSED;
        const updateSources = new Set(this._changeSources);
        this._changeSources.clear();

        instance.execFrameRequesters('before_camera_update', dt, this._updateLoopRestarted);
        instance.execCameraUpdate();
        instance.execFrameRequesters('after_camera_update', dt, this._updateLoopRestarted);

        // Disable camera's matrix auto update to make sure the camera's
        // world matrix is never updated mid-update.
        // Otherwise inconsistencies can appear because object visibility
        // testing and object drawing could be performed using different
        // camera matrixWorld.
        // Note: this is required at least because WEBGLRenderer calls
        // camera.updateMatrixWorld()
        const oldAutoUpdate = instance.camera.camera3D.matrixAutoUpdate;
        instance.camera.camera3D.matrixAutoUpdate = false;

        // update data-structure
        this._update(instance, updateSources, dt);

        // Redraw *only* if needed.
        // (redraws only happen when this.needsRedraw is true, which in turn only happens when
        // instance.notifyChange() is called with redraw=true)
        // As such there's no continuous update-loop, instead we use a ad-hoc update/render
        // mechanism.
        if (willRedraw) {
            this._renderInstance(instance, dt);
        }

        // next time, we'll consider that we've just started the loop if we are still PAUSED now
        this._updateLoopRestarted = this._renderingState === RenderingState.RENDERING_PAUSED;

        instance.camera.camera3D.matrixAutoUpdate = oldAutoUpdate;

        instance.execFrameRequesters('update_end', dt, this._updateLoopRestarted);
    }

    private _renderInstance(instance: Instance, dt: number) {
        instance.execFrameRequesters('before_render', dt, this._updateLoopRestarted);
        instance.render();
        instance.execFrameRequesters('after_render', dt, this._updateLoopRestarted);
    }
}

export default MainLoop;
