import { Vector3, Plane, EventDispatcher, Math as ThreeMath, Sphere } from 'three';
import { GeometryLayer, Layer } from './Layer/Layer';
import Cache from '../Core/Scheduler/Cache';

export const RENDERING_PAUSED = 0;
export const RENDERING_SCHEDULED = 1;

// TODO should probably be configurable?
const MAX_DISTANCE = 2000000000;

const _tmpSphere = new Sphere();

/**
 * MainLoop's update events list that are fired using
 * {@link View#execFrameRequesters}.
 *
 * @property UPDATE_START {string} fired at the start of the update
 * @property BEFORE_CAMERA_UPDATE {string} fired before the camera update
 * @property AFTER_CAMERA_UPDATE {string} fired after the camera update
 * @property BEFORE_LAYER_UPDATE {string} fired before the layer update
 * @property AFTER_LAYER_UPDATE {string} fired after the layer update
 * @property BEFORE_RENDER {string} fired before the render
 * @property AFTER_RENDER {string} fired after the render
 * @property UPDATE_END {string} fired at the end of the update
 */

export const MAIN_LOOP_EVENTS = {
    UPDATE_START: 'update_start',
    BEFORE_CAMERA_UPDATE: 'before_camera_update',
    AFTER_CAMERA_UPDATE: 'after_camera_update',
    BEFORE_LAYER_UPDATE: 'before_layer_update',
    AFTER_LAYER_UPDATE: 'after_layer_update',
    BEFORE_RENDER: 'before_render',
    AFTER_RENDER: 'after_render',
    UPDATE_END: 'update_end',
};

function MainLoop(scheduler, engine) {
    this.renderingState = RENDERING_PAUSED;
    this.needsRedraw = false;
    this.scheduler = scheduler;
    this.gfxEngine = engine; // TODO: remove me
    this._updateLoopRestarted = true;
}

MainLoop.prototype = Object.create(EventDispatcher.prototype);
MainLoop.prototype.constructor = MainLoop;

MainLoop.prototype.scheduleViewUpdate = function scheduleViewUpdate(view, forceRedraw) {
    this.needsRedraw |= forceRedraw;

    if (this.renderingState !== RENDERING_SCHEDULED) {
        this.renderingState = RENDERING_SCHEDULED;

        if (__DEBUG__) {
            document.title += ' ⌛';
        }

        requestAnimationFrame((timestamp) => { this._step(view, timestamp); });
    }
};

function updateElements(context, geometryLayer, elements) {
    if (!elements) {
        return;
    }
    for (const element of elements) {
        // update element
        // TODO find a way to notify attachedLayers when geometryLayer deletes some elements
        // and then update Debug.js:addGeometryLayerDebugFeatures
        const newElementsToUpdate = geometryLayer.update(context, geometryLayer, element);

        const sub = geometryLayer.getObjectToUpdateForAttachedLayers(element);

        if (sub) {
            if (sub.element) {
                if (__DEBUG__) {
                    if (!(sub.element.isObject3D)) {
                        throw new Error(`
                            Invalid object for attached layer to update.
                            Must be a THREE.Object and have a THREE.Material`);
                    }
                }
                // update attached layers
                for (const attachedLayer of geometryLayer._attachedLayers) {
                    if (attachedLayer.ready) {
                        attachedLayer.update(context, attachedLayer, sub.element, sub.parent);
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
                    for (const attachedLayer of geometryLayer._attachedLayers) {
                        if (attachedLayer.ready) {
                            attachedLayer.update(context, attachedLayer, sub.elements[i], sub.parent);
                        }
                    }
                }
            }
        }
        updateElements(context, geometryLayer, newElementsToUpdate);
    }
}

function filterChangeSources(updateSources, geometryLayer) {
    let fullUpdate = false;
    const filtered = new Set();
    updateSources.forEach((src) => {
        if (src === geometryLayer || src.isCamera) {
            fullUpdate = true;
        } else if (src.layer === geometryLayer) {
            filtered.add(src);
        }
    });
    return fullUpdate ? new Set([geometryLayer]) : filtered;
}

MainLoop.prototype._update = function _update(view, updateSources, dt) {
    const context = {
        // View's camera
        camera: view.camera,
        // Command scheduler
        scheduler: this.scheduler,
        // The view
        view,
        // Min/max distance to the camera, for all rendered objects.
        // (processing update function are expected to update this)
        distance: {
            plane: new Plane()
                .setFromNormalAndCoplanarPoint(
                    view.camera.camera3D.getWorldDirection(new Vector3()),
                    view.camera.camera3D.position /* TODO matrixWorld */),
            min: Infinity,
            max: 0,
        },
        // Attribute allowing processing code to remember whether they
        // did a full update (in which case fastUpdateHint is undefined)
        // or a partial update and to act accordingly
        fastUpdateHint: undefined,
    };

    const previousNear = view.camera.camera3D.near;
    const previousFar = view.camera.camera3D.far;
    // Reset near/far to default value to allow update function to test
    // visibility using camera's frustum; without depending on the near/far
    // values which are only used for rendering.
    view.camera.camera3D.near = 0.1;
    view.camera.camera3D.far = MAX_DISTANCE;
    // We can't just use camera3D.updateProjectionMatrix() because part of
    // the update process use camera._viewMatrix, and this matrix depends
    // on near/far values.
    view.camera.update();

    // replace layer with their parent where needed
    updateSources.forEach((src) => {
        const layer = src.layer || src;
        if (layer instanceof Layer) {
            if (!(layer instanceof GeometryLayer)) {
                // add the parent layer to update sources
                updateSources.add(view.getParentLayer(layer));
            }
        }
    });

    for (const geometryLayer of view.getLayers((x, y) => !y)) {
        context.fastUpdateHint = undefined;
        context.geometryLayer = geometryLayer;
        if (geometryLayer.ready && geometryLayer.visible) {
            view.execFrameRequesters(MAIN_LOOP_EVENTS.BEFORE_LAYER_UPDATE, dt, this._updateLoopRestarted, geometryLayer);

            // Filter updateSources that are relevant for the geometryLayer
            const srcs = filterChangeSources(updateSources, geometryLayer);
            if (srcs.size > 0) {
                // if we don't have any element in srcs, it means we don't need to update our layer to display it correctly.
                // but in this case we still need to use layer._distance to calculate near / far
                // hence the reset is here, and the update of context.distance is outside of this if
                geometryLayer._distance.min = Infinity;
                geometryLayer._distance.max = 0;
                // `preUpdate` returns an array of elements to update
                const elementsToUpdate = geometryLayer.preUpdate(context, geometryLayer, srcs);
                // `update` is called in `updateElements`.
                updateElements(context, geometryLayer, elementsToUpdate);
                // `postUpdate` is called when this geom layer update process is finished
                geometryLayer.postUpdate(context, geometryLayer, updateSources);
            }
            if (geometryLayer._distance) {
                context.distance.min = Math.min(context.distance.min, geometryLayer._distance.min);
                if (geometryLayer._distance.max == Infinity) {
                    context.distance.max = MAX_DISTANCE;
                } else {
                    context.distance.max = Math.max(context.distance.max, geometryLayer._distance.max);
                }
            }
            view.execFrameRequesters(MAIN_LOOP_EVENTS.AFTER_LAYER_UPDATE, dt, this._updateLoopRestarted, geometryLayer);
        }
    }

    view._threeObjects.traverse(o => {
        if (o.geometry) {
            if (o.geometry.boundingSphere) {
                _tmpSphere.copy(o.geometry.boundingSphere);
                _tmpSphere.applyMatrix4(o.matrixWorld);
                const d = _tmpSphere.distanceToPoint(context.camera.camera3D.position);
                context.distance.min = ThreeMath.clamp(d, 0, context.distance.min);

                context.distance.max = Math.max(context.distance.max, d + 2 * _tmpSphere.radius);
            } else {
                console.warn('object.geometry without boundingSphere!!', o);
            }
        }
    });

    // TODO so we need to take into account objects added through view.scene.add !!
    // and also every Object3D added independently to the scene !!
    // layer and provider are not the correct abstraction for this. must be lower level (traverse view.scene ?)
    view.camera.camera3D.near = context.distance.min === Infinity ? previousNear : 0.1; // context.distance.min;
    view.camera.camera3D.far = context.distance.max === 0 ? previousFar :
        ThreeMath.clamp(context.distance.max, view.camera.camera3D.near, MAX_DISTANCE);
    view.camera.update();
};

MainLoop.prototype._step = function _step(view, timestamp) {
    const dt = timestamp - this._lastTimestamp;
    view._executeFrameRequestersRemovals();

    view.execFrameRequesters(MAIN_LOOP_EVENTS.UPDATE_START, dt, this._updateLoopRestarted);

    const willRedraw = this.needsRedraw;
    this._lastTimestamp = timestamp;

    // Reset internal state before calling _update (so future calls to View.notifyChange()
    // can properly change it)
    this.needsRedraw = false;
    this.renderingState = RENDERING_PAUSED;
    const updateSources = new Set(view._changeSources);
    view._changeSources.clear();

    // update camera
    const dim = this.gfxEngine.getWindowSize();

    view.execFrameRequesters(MAIN_LOOP_EVENTS.BEFORE_CAMERA_UPDATE, dt, this._updateLoopRestarted);
    view.camera.update(dim.x, dim.y);
    view.execFrameRequesters(MAIN_LOOP_EVENTS.AFTER_CAMERA_UPDATE, dt, this._updateLoopRestarted);

    // Disable camera's matrix auto update to make sure the camera's
    // world matrix is never updated mid-update.
    // Otherwise inconsistencies can appear because object visibility
    // testing and object drawing could be performed using different
    // camera matrixWorld.
    // Note: this is required at least because WEBGLRenderer calls
    // camera.updateMatrixWorld()
    const oldAutoUpdate = view.camera.camera3D.matrixAutoUpdate;
    view.camera.camera3D.matrixAutoUpdate = false;

    // update data-structure
    this._update(view, updateSources, dt);

    if (this.scheduler.commandsWaitingExecutionCount() == 0) {
        this.dispatchEvent({ type: 'command-queue-empty' });
    }

    // Redraw *only* if needed.
    // (redraws only happen when this.needsRedraw is true, which in turn only happens when
    // view.notifyChange() is called with redraw=true)
    // As such there's no continuous update-loop, instead we use a ad-hoc update/render
    // mechanism.
    if (willRedraw) {
        this._renderView(view, dt);
    }

    // next time, we'll consider that we've just started the loop if we are still PAUSED now
    this._updateLoopRestarted = this.renderingState === RENDERING_PAUSED;

    if (__DEBUG__) {
        document.title = document.title.substr(0, document.title.length - 2);
    }

    view.camera.camera3D.matrixAutoUpdate = oldAutoUpdate;

    // Clear the cache of expired resources
    Cache.flush();

    view.execFrameRequesters(MAIN_LOOP_EVENTS.UPDATE_END, dt, this._updateLoopRestarted);
};

MainLoop.prototype._renderView = function _renderView(view, dt) {
    view.execFrameRequesters(MAIN_LOOP_EVENTS.BEFORE_RENDER, dt, this._updateLoopRestarted);

    if (view.render) {
        view.render();
    } else {
        // use default rendering method
        this.gfxEngine.renderView(view);
    }

    view.execFrameRequesters(MAIN_LOOP_EVENTS.AFTER_RENDER, dt, this._updateLoopRestarted);
};

export default MainLoop;
