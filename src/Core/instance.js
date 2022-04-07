/**
 * @module Core/instance
 *
 */
import {
    Scene, Group, EventDispatcher, Vector2, Object3D,
} from 'three';
import Camera from '../Renderer/Camera.js';
import MainLoop, { MAIN_LOOP_EVENTS, RENDERING_PAUSED } from './MainLoop.js';
import C3DEngine from '../Renderer/c3DEngine.js';
import { STRATEGY_MIN_NETWORK_TRAFFIC } from './Layer/LayerUpdateStrategy.js';
import Layer, { defineLayerProperty } from './Layer/Layer.js';
import GeometryLayer from './Layer/GeometryLayer.js';
import Scheduler from './Scheduler/Scheduler.js';
import Picking from './Picking.js';
import TiledNodeProcessing from '../Process/TiledNodeProcessing.js';
import OlFeature2Mesh from '../Renderer/ThreeExtended/OlFeature2Mesh.js';
import ObjectRemovalHelper from '../Process/ObjectRemovalHelper.js';

export const VIEW_EVENTS = {
    /**
     * Fires when all the layers of the view are considered initialized.
     * Initialized in this context means: all layers are ready to be
     * displayed (no pending network access, no visual improvement to be
     * expected, ...).
     * If you add new layers, the event will be fired again when all
     * layers are ready.
     * @event View#layers-initialized
     * @property type {string} layers-initialized
     */
    LAYERS_INITIALIZED: 'layers-initialized',
};

const _eventCoords = new Vector2();
/**
 * The instance is the core component of Giro3D. It encapsulates the 3D scene, the current camera
 * and one or more 3D objects, like a {@link module:Core/map~Map}.
 *
 *
 *     // example of Giro3D instanciation
 *     let instance = new giro3d.Instance(viewerDiv, extent.crs(), {camera: camera})
 *     let map = new giro3d.Map('planar', null, extent, { maxSubdivisionLevel: 10 });
 *     instance.add(map);
 *
 *
 * @api
 */
class Instance extends EventDispatcher {
    /**
     * Constructs a giro3d Instance
     *
     *
     * @param {HTMLElement} viewerDiv - Where to instanciate the Three.js scene in the DOM
     * @param {Object=} options - Optional properties.
     * @param {?string} [options.crs='EPSG:3857'] - The default CRS of Three.js coordinates. Should
     * be a cartesian CRS.
     * @param {?Scene} options.scene3D - {@link Scene} Three.js scene instance to use, otherwise a
     * default one will
     * be constructed
     *
     * @api
     *
     * */
    constructor(viewerDiv, options = {}) {
        super();
        Object3D.DefaultUp.set(0, 0, 1);
        if (!viewerDiv) {
            throw new Error('Invalid viewerDiv parameter (must non be null/undefined)');
        }

        this.referenceCrs = options.crs || 'EPSG:3857';

        let engine;
        // options.renderer can be 2 separate things:
        //   - an actual renderer (in this case we don't use viewerDiv)
        //   - options for the renderer to be created
        if (options.renderer && options.renderer.domElement) {
            engine = new C3DEngine(options.renderer);
        } else {
            engine = new C3DEngine(viewerDiv, options.renderer);
        }

        this.mainLoop = options.mainLoop || new MainLoop(new Scheduler(), engine);

        this.scene = options.scene3D || new Scene();
        // will contain simple three objects that need to be taken into
        // account, for example camera near / far calculation maybe it'll be
        // better to do the contrary: having a group where *all* the giro3d
        // object will be added, and traverse all other objects for near far
        // calculation but actually I'm not even sure near far calculation is
        // worthy of this.
        this.threeObjects = new Group();
        this.scene.add(this.threeObjects);
        this.scene2D = new Scene();
        if (!options.scene3D) {
            this.scene.autoUpdate = false;
        }

        this.camera = new Camera(
            this.referenceCrs,
            this.mainLoop.gfxEngine.getWindowSize().x,
            this.mainLoop.gfxEngine.getWindowSize().y,
            options,
        );

        this._frameRequesters = { };
        this._objects = [];

        window.addEventListener('resize', () => {
            // using boundingRect because clientWidth/height round the result (at least in chrome)
            // resulting in unwanted scrollbars
            const boundingRect = viewerDiv.getBoundingClientRect();
            const newSize = new Vector2(boundingRect.width, boundingRect.height);
            this.mainLoop.gfxEngine.onWindowResize(newSize.x, newSize.y);
            this.notifyChange(this.camera.camera3D);
        }, false);

        this._changeSources = new Set();

        if (__DEBUG__) {
            this.isDebugMode = true;
        }

        this._delayedFrameRequesterRemoval = [];

        this._allLayersAreReadyCallback = () => {
            // all layers must be ready
            // TODO should check
            const allReady = this.getObjects().every(obj => obj.ready)
                && this.getLayers().every(layer => layer.ready);
            if (allReady
                && this.mainLoop.scheduler.commandsWaitingExecutionCount() === 0
                && this.mainLoop.renderingState === RENDERING_PAUSED) {
                this.dispatchEvent({ type: VIEW_EVENTS.LAYERS_INITIALIZED });
                this.removeFrameRequester(
                    MAIN_LOOP_EVENTS.UPDATE_END, this._allLayersAreReadyCallback,
                );
            }
        };
    }

    /**
     * @typedef {Object} LayerOptions
     * @property {string} id Unique layer's id
     * @property {string} type the layer's type : 'color', 'elevation', 'geometry'
     * @property {string} protocol wmts and wms (wmtsc for custom deprecated)
     * @property {string} url Base URL of the repository or of the file(s) to load
     * @property {string} format Format of this layer. See individual providers to check which
     * formats are supported for a given layer type.
     * @property {NetworkOptions} networkOptions Options for fetching resources over network
     * @property {Object} updateStrategy strategy to load imagery files
     * @property {OptionsWmts|OptionsWms} options WMTS or WMS options
     */

    /**
     * Add layer in instance.
     * The layer id must be unique.
     *
     * This function calls `preprocessDataLayer` of the relevant provider with this
     * layer and set `layer.whenReady` to a promise that resolves when
     * the preprocessing operation is done. This promise is also returned by
     * `addLayer` allowing to chain call.
     *
     * @example
     * // Add Color Layer
     * instance.addLayer({
     *      type: 'elevation',
     *      id: 'iElevation',
     * });
     *
     * // Example to add an OPENSM Layer
     * instance.addLayer({
     *   type: 'color',
     *   protocol:   'xyz',
     *   id:         'OPENSM',
     *   fx: 2.5,
     *   url:  'http://b.tile.openstreetmap.fr/osmfr/${z}/${x}/${y}.png',
     *   format: 'image/png',
     *   options: {
     *       attribution : {
     *           name: 'OpenStreetMap',
     *           url: 'http://www.openstreetmap.org/',
     *       },
     *       tileMatrixSet: 'PM',
     *    },
     * });
     *
     * // Add Elevation Layer and do something once it's ready
     * var layer = instance.addLayer({
     *      type: 'elevation',
     *      id: 'iElevation',
     * }).then(() => { .... });
     *
     * // One can also attach a callback to the same promise with a layer instance.
     * layer.whenReady.then(() => { ... });
     *
     * @param {LayerOptions|Layer|GeometryLayer} object
     * @param {Layer=} parentLayer
     * @return {Promise} a promise resolved with the new layer object when it is fully initialized
     * or rejected if any error occurred.
     * @api
     */
    add(object) {
        // this should be in map or other objects
        if (object.protocol === 'tile') {
            // TODO
            object.disableSkirt = true;
            object.preUpdate = TiledNodeProcessing.preUpdate;
            object.update = TiledNodeProcessing.update;
            // TODO following lines probably shows that this code belong to Map
            object._instance = this;
            object.pickObjectsAt = (_instance, mouse, radius) => Picking.pickTilesAt(
                _instance,
                mouse,
                radius,
                object,
            );
        }

        return new Promise((resolve, reject) => {
            if (!object) {
                reject(new Error('object is undefined'));
                return;
            }
            const duplicate = this.getObjects((l => l.id === object.id));
            if (duplicate.length > 0) {
                reject(new Error(`Invalid id '${object.id}': id already used`));
                return;
            }

            const provider = this.mainLoop.scheduler.getProtocolProvider(object.protocol);
            if (object.protocol && !provider) {
                reject(new Error(`${object.protocol} is not a recognized protocol name.`));
                return;
            }

            object = _preprocessObject(this, object, provider);

            if (!object.projection) {
                object.projection = this.referenceCrs;
            }

            this._objects.push(object);
            object.whenReady.then(l => {
                if (typeof (l.update) !== 'function') {
                    reject(new Error('Cant add GeometryLayer: missing a update function'));
                    return;
                }
                if (typeof (l.preUpdate) !== 'function') {
                    reject(new Error('Cant add GeometryLayer: missing a preUpdate function'));
                    return;
                }

                if (l.object3d && !l.object3d.parent && l.object3d !== this.scene) {
                    this.scene.add(l.object3d);
                }

                this.notifyChange(l, false);
                const updateEndFR = this._frameRequesters[MAIN_LOOP_EVENTS.UPDATE_END];
                if (!updateEndFR || updateEndFR.indexOf(this._allLayersAreReadyCallback) === -1) {
                    this.addFrameRequester(
                        MAIN_LOOP_EVENTS.UPDATE_END,
                        this._allLayersAreReadyCallback,
                    );
                }
                resolve(l);
            });
        });
    }

    removeObject(object) {
        if (object.object3d) {
            ObjectRemovalHelper.removeChildrenAndCleanupRecursively(object, object.object3d);
            this.scene.remove(object.object3d);
        }
        if (typeof object.clean === 'function') {
            object.clean();
        }
        this._objects.splice(this._objects.indexOf(object, 1));
        this.notifyChange(this.camera.camera3D, true);
    }

    addVector(vector) {
        return new Promise(resolve => {
            const source = vector.getSource();
            const convert = OlFeature2Mesh.convert({ altitude: 1 });
            // default loader does not have a "success" callback. Instead openlayers tests for
            if (source.getFeatures().length > 0) {
                vector.object3d = convert(source.getFeatures());
                this.threeObjects.add(vector.object3d);
                this.notifyChange(vector.object3d, true);
                resolve(vector);
            }
            source.on('change', () => {
                // naive way of dealing with changes : remove everything and add everything back
                if (vector.object3d) {
                    this._threeObjects.remove(vector.object3d);
                    vector.object3d.traverse(o => {
                        if (o.material) {
                            o.material.dispose();
                        }
                        if (o.geometry) {
                            o.geometry.dispose();
                        }
                        o.dispose();
                    });
                }
                vector.object3d = convert(source.getFeatures());
                this.threeObjects.add(vector.object3d);
                this.notifyChange(vector.object3d, true);
                resolve(vector);
            });
            source.loadFeatures(
                [-Infinity, -Infinity, Infinity, Infinity],
                undefined,
                this.referenceCrs,
            );
        });
    }

    /**
     * Notifies the scene it needs to be updated due to changes exterior to the
     * scene itself (e.g. camera movement).
     * non-interactive events (e.g: texture loaded)
     * @param {*} changeSource
     * @param {boolean} needsRedraw - indicates if notified change requires a full scene redraw.
     */
    notifyChange(changeSource = undefined, needsRedraw = true) {
        if (changeSource) {
            this._changeSources.add(changeSource);
        }
        this.mainLoop.scheduleUpdate(this, needsRedraw);
    }

    /**
     * Get all opjects, with an optionnal filter applied.
     * The filter method allows to get only a subset of objects
     * @example
     * // get all objects
     * view.getObjects();
     * // get one layer with id
     * view.getObjects(layer => layer.id === 'itt');
     * @param {function(GeometryLayer):boolean} filter
     * @returns {Array<Layer>}
     */
    getObjects(filter) {
        const result = [];
        for (const geometryLayer of this._objects) {
            if (!filter || filter(geometryLayer)) {
                result.push(geometryLayer);
            }
        }
        return result;
    }

    /**
     * Get all the layers attached to all the GeometryLayer of this objects
     * @param {function(Layer):boolean} filter Optional filter function for attached layers
     * @return {Array<Layer>}
     */
    getLayers(filter) {
        let result = [];
        for (const geometryLayer of this._objects) {
            result = result.concat(geometryLayer.getLayers(filter));
        }
        return result;
    }

    /**
     * @param {Layer} layer
     * @returns {GeometryLayer} the parent layer of the given layer or undefined.
     */
    getParentLayer(layer) {
        for (const geometryLayer of this._objects) {
            for (const attached of geometryLayer._attachedLayers) {
                if (attached === layer) {
                    return geometryLayer;
                }
            }
        }
        return null;
    }

    /**
     * @name FrameRequester
     * @function
     *
     * @description
     * Method that will be called each time the <code>MainLoop</code> updates. This
     * function will be given as parameter the delta (in ms) between this update and
     * the previous one, and whether or not we just started to render again. This
     * update is considered as the "next" update if <code>view.notifyChange</code>
     * was called during a precedent update. If <code>view.notifyChange</code> has
     * been called by something else (other micro/macrotask, UI events etc...), then
     * this update is considered as being the "first". It can also receive optional
     * arguments, depending on the attach point of this function.  Currently only
     * <code>BEFORE_LAYER_UPDATE / AFTER_LAYER_UPDATE</code> attach points provide
     * an additional argument: the layer being updated.
     * <br><br>
     *
     * This means that if a <code>frameRequester</code> function wants to animate something, it
     * should keep on calling <code>view.notifyChange</code> until its task is done.
     * <br><br>
     *
     * Implementors of <code>frameRequester</code> should keep in mind that this
     * function will be potentially called at each frame, thus care should be given
     * about performance.
     * <br><br>
     *
     * Typical frameRequesters are controls, module wanting to animate moves or UI
     * elements etc... Basically anything that would want to call
     * requestAnimationFrame.
     *
     * @param {number} dt
     * @param {boolean} updateLoopRestarted
     * @param {...*} args
     */
    /**
     * Add a frame requester to this view.
     *
     * FrameRequesters can activate the MainLoop update by calling view.notifyChange.
     *
     * @param {String} when - decide when the frameRequester should be called during
     * the update cycle. Can be any of {@link MAIN_LOOP_EVENTS}.
     * @param {FrameRequester} frameRequester - this function will be called at each
     * MainLoop update with the time delta between last update, or 0 if the MainLoop
     * has just been relaunched.
     */
    addFrameRequester(when, frameRequester) {
        if (typeof frameRequester !== 'function') {
            throw new Error('frameRequester must be a function');
        }

        if (!this._frameRequesters[when]) {
            this._frameRequesters[when] = [frameRequester];
        } else {
            this._frameRequesters[when].push(frameRequester);
        }
    }

    /**
     * Remove a frameRequester.
     * The effective removal will happen either later; at worst it'll be at
     * the beginning of the next frame.
     *
     * @param {String} when - attach point of this requester. Can be any of
     * {@link MAIN_LOOP_EVENTS}.
     * @param {FrameRequester} frameRequester
     */
    removeFrameRequester(when, frameRequester) {
        const index = this._frameRequesters[when].indexOf(frameRequester);
        if (index >= 0) {
            this._delayedFrameRequesterRemoval.push({ when, frameRequester });
        } else {
            console.error('Invalid call to removeFrameRequester: frameRequester isn\'t registered');
        }
    }

    _executeFrameRequestersRemovals() {
        for (const toDelete of this._delayedFrameRequesterRemoval) {
            const index = this._frameRequesters[toDelete.when].indexOf(toDelete.frameRequester);
            if (index >= 0) {
                this._frameRequesters[toDelete.when].splice(index, 1);
            } else {
                console.warn('FrameReq has already been removed');
            }
        }
        this._delayedFrameRequesterRemoval.length = 0;
    }

    /**
     * Execute a frameRequester.
     *
     * @param {String} when - attach point of this (these) requester(s). Can be any
     * of {@link MAIN_LOOP_EVENTS}.
     * @param {Number} dt - delta between this update and the previous one
     * @param {boolean} updateLoopRestarted
     * @param {...*} args - optional arguments
     */
    execFrameRequesters(when, dt, updateLoopRestarted, ...args) {
        if (!this._frameRequesters[when]) {
            return;
        }

        if (this._delayedFrameRequesterRemoval.length > 0) {
            this._executeFrameRequestersRemovals();
        }

        for (const frameRequester of this._frameRequesters[when]) {
            if (frameRequester.update) {
                frameRequester.update(dt, updateLoopRestarted, args);
            } else {
                frameRequester(dt, updateLoopRestarted, args);
            }
        }
    }

    /**
     * Extract view coordinates from a mouse-event / touch-event
     * @param {event} event - event can be a MouseEvent or a TouchEvent
     * @param {number} touchIdx - finger index when using a TouchEvent (default: 0)
     * @return {THREE.Vector2} - view coordinates (in pixels, 0-0 = top-left of the View)
     */
    eventToViewCoords(event, touchIdx = 0) {
        if (event.touches === undefined || !event.touches.length) {
            return _eventCoords.set(event.offsetX, event.offsetY);
        }
        const br = this.mainLoop.gfxEngine.renderer.domElement.getBoundingClientRect();
        return _eventCoords.set(
            event.touches[touchIdx].clientX - br.x,
            event.touches[touchIdx].clientY - br.y,
        );
    }

    /**
     * Extract normalized coordinates (NDC) from a mouse-event / touch-event
     * @param {event} event - event can be a MouseEvent or a TouchEvent
     * @param {number} touchIdx - finger index when using a TouchEvent (default: 0)
     * @return {THREE.Vector2} - NDC coordinates (x and y are [-1, 1])
     */
    eventToNormalizedCoords(event, touchIdx = 0) {
        return this.viewToNormalizedCoords(this.eventToViewCoords(event, touchIdx));
    }

    /**
     * Convert view coordinates to normalized coordinates (NDC)
     * @param {Vector2} viewCoords (in pixels, 0-0 = top-left of the View)
     * @return {THREE.Vector2} - NDC coordinates (x and y are [-1, 1])
     */
    viewToNormalizedCoords(viewCoords) {
        _eventCoords.x = 2 * (viewCoords.x / this.camera.width) - 1;
        _eventCoords.y = -2 * (viewCoords.y / this.camera.height) + 1;
        return _eventCoords;
    }

    /**
     * Convert NDC coordinates to view coordinates
     * @param {Vector2} ndcCoords
     * @return {THREE.Vector2} - view coordinates (in pixels, 0-0 = top-left of the View)
     */
    normalizedToViewCoords(ndcCoords) {
        _eventCoords.x = (ndcCoords.x + 1) * 0.5 * this.camera.width;
        _eventCoords.y = (ndcCoords.y - 1) * -0.5 * this.camera.height;
        return _eventCoords;
    }

    /**
     * Return objects from some layers/objects3d under the mouse in this view.
     *
     * @param {Object} mouseOrEvt - mouse position in window coordinates (0, 0 = top-left)
     * or MouseEvent or TouchEvent
     * @param {number} radius - picking will happen in a circle centered on mouseOrEvt. Radius
     * is the radius of this circle, in pixels
     * @param {...*} where - where to look for objects. Can be either: empty (= look
     * in all layers with type === 'geometry'), layer ids or layers or a mix of all
     * the above.
     * @return {Array} - an array of objects. Each element contains at least an object
     * property which is the Object3D under the cursor. Then depending on the queried
     * layer/source, there may be additionnal properties (coming from THREE.Raycaster
     * for instance).
     *
     * @example
     * view.pickObjectsAt({ x, y })
     * view.pickObjectsAt({ x, y }, 1, 'wfsBuilding')
     * view.pickObjectsAt({ x, y }, 3, 'wfsBuilding', myLayer)
     */
    pickObjectsAt(mouseOrEvt, radius, ...where) {
        const results = [];
        const sources = where.length === 0 ? this.getObjects() : [...where];
        const mouse = (mouseOrEvt instanceof Event)
            ? this.eventToViewCoords(mouseOrEvt) : mouseOrEvt;
        radius = radius || 0;

        for (const source of sources) {
            if (source instanceof GeometryLayer
                || source instanceof Layer
                || typeof (source) === 'string') {
                const object = (typeof (source) === 'string')
                    ? objectIdToObject(this, source)
                    : source;

                // TODO ability to pick on a layer instead of a geometric object?
                const sp = object.pickObjectsAt(this, mouse, radius);
                // warning: sp might be very large, so we can't use '...sp' (we'll hit
                // 'javascript maximum call stack size exceeded' error) nor
                // Array.prototype.push.apply(result, sp)
                for (let i = 0; i < sp.length; i++) {
                    results.push(sp[i]);
                }
            } else if (source instanceof Object3D) {
                Picking.pickObjectsAt(
                    this,
                    mouse,
                    radius,
                    source,
                    results,
                );
            } else {
                throw new Error(`Invalid where arg (value = ${where}). Expected layers, layer ids or Object3Ds`);
            }
        }

        return results;
    }

    focusObject(obj) {
        if (obj instanceof Map) {
            // Configure camera
            // TODO support different CRS
            const dim = obj.extent.dimensions();
            const positionCamera = obj.extent.center().clone();
            positionCamera._values[2] = Math.max(dim.x, dim.y);
            const lookat = positionCamera.xyz();
            lookat.z = 0; // TODO this supposes there is no terrain, nor z-displacement

            this.camera.camera3D.position.copy(positionCamera.xyz());
            this.camera.camera3D.lookAt(lookat);
            this.camera.camera3D.updateMatrixWorld(true);
        }
    }
}

const _syncGeometryLayerVisibility = function _syncGeometryLayerVisibility(layer, view) {
    if (layer.object3d) {
        layer.object3d.visible = layer.visible;
    }

    if (layer.threejsLayer) {
        if (layer.visible) {
            view.camera.camera3D.layers.enable(layer.threejsLayer);
        } else {
            view.camera.camera3D.layers.disable(layer.threejsLayer);
        }
    }
};

function _preprocessObject(view, layer, provider, parentLayer) {
    if (!(layer instanceof Layer) && !(layer instanceof GeometryLayer)) {
        const nlayer = new Layer(layer.id);
        // nlayer.id is read-only so delete it from layer before Object.assign
        const tmp = layer;
        delete tmp.id;
        layer = Object.assign(nlayer, layer);
        // restore layer.id in user provider layer object
        tmp.id = layer.id;
    }

    layer.options = layer.options || {};

    if (!layer.updateStrategy) {
        layer.updateStrategy = {
            type: STRATEGY_MIN_NETWORK_TRAFFIC,
        };
    }

    if (provider) {
        if (provider.tileInsideLimit) {
            layer.tileInsideLimit = provider.tileInsideLimit.bind(provider);
        }
        if (provider.getPossibleTextureImprovements) {
            layer.getPossibleTextureImprovements = provider
                .getPossibleTextureImprovements
                .bind(provider);
        }
        if (provider.tileTextureCount) {
            layer.tileTextureCount = provider.tileTextureCount.bind(provider);
        }
    }

    if (!layer.whenReady) {
        if (!layer.object3d) {
            // layer.threejsLayer *must* be assigned before preprocessing,
            // because TileProvider.preprocessDataLayer function uses it.
            layer.threejsLayer = view.mainLoop.gfxEngine.getUniqueThreejsLayer();
        }
        let providerPreprocessing = Promise.resolve();
        if (provider && provider.preprocessDataLayer) {
            providerPreprocessing = provider.preprocessDataLayer(
                layer, view, view.mainLoop.scheduler, parentLayer,
            );
            if (!(providerPreprocessing && providerPreprocessing.then)) {
                providerPreprocessing = Promise.resolve();
            }
        }

        // the last promise in the chain must return the layer
        layer.whenReady = providerPreprocessing.then(() => {
            layer.ready = true;
            return layer;
        });
    }

    // probably not the best place to do this
    defineLayerProperty(layer, 'visible', true, () => _syncGeometryLayerVisibility(layer, view));
    defineLayerProperty(layer, 'frozen', false);
    _syncGeometryLayerVisibility(layer, view);
    return layer;
}

function objectIdToObject(view, layerId) {
    const lookup = view.getObjects(l => l.id === layerId);
    if (!lookup.length) {
        throw new Error(`Invalid layer id used as where argument (value = ${layerId})`);
    }
    return lookup[0];
}

export default Instance;
