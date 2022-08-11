/**
 * @module Core/Instance
 */
import {
    Scene, Group, EventDispatcher, Vector2, Object3D,
} from 'three';
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import Camera from '../Renderer/Camera.js';
import MainLoop, { MAIN_LOOP_EVENTS, RENDERING_PAUSED } from './MainLoop.js';
import C3DEngine from '../Renderer/c3DEngine.js';
import { STRATEGY_MIN_NETWORK_TRAFFIC } from './layer/LayerUpdateStrategy.js';
import Layer, { defineLayerProperty } from './layer/Layer.js';
import Entity3D from '../entities/Entity3D.js';
import Scheduler from './Scheduler/Scheduler.js';
import Picking from './Picking.js';
import OlFeature2Mesh from '../Renderer/ThreeExtended/OlFeature2Mesh.js';
import ObjectRemovalHelper from '../Process/ObjectRemovalHelper.js';

/**
 * The names of events supported by
 * [`Instance.addEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.addEventListener)
 * and
 * [`Instance.removeEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.removeEventListener)
 *
 * @api
 */
export const INSTANCE_EVENTS = {
    /**
     * Fires when all the layers of the instance are considered initialized.
     * Initialized in this context means: all layers are ready to be
     * displayed (no pending network access, no visual improvement to be
     * expected, ...).
     * If you add new layers, the event will be fired again when all
     * layers are ready.
     *
     * @api
     * @event Instance#layers-initialized
     */
    LAYERS_INITIALIZED: 'layers-initialized',
};

const _eventCoords = new Vector2();

/**
 * The instance is the core component of Giro3D. It encapsulates the 3D scene,
 * the current camera and one or more {@link module:entities/Entity~Entity entities},
 * such as a {@link module:entities/Map~Map Map}.
 *
 *     // example of Giro3D instantiation
 *
 *     let instance = new Instance(viewerDiv, extent.crs(), {camera: camera})
 *     let map = new Map('planar', null, extent, { maxSubdivisionLevel: 10 });
 *     instance.add(map);
 *
 * @api
 */
class Instance extends EventDispatcher {
    /**
     * Constructs a giro3d Instance
     *
     * @param {HTMLElement} viewerDiv Where to instanciate the Three.js scene in the DOM
     * @param {object=} options Optional properties.
     * @param {?string} [options.crs='EPSG:3857'] The default CRS of Three.js coordinates. Should
     * be a cartesian CRS.
     * @param {?Scene} options.scene3D the [Three.js Scene](https://threejs.org/docs/#api/en/scenes/Scene) instance to use,
     * otherwise a default one will be constructed
     * @example
     * let opts = {
     *  camera: camera,
     *  crs = exent.crs()
     * };
     * let instance = new Instance(viewerDiv, opts);
     * let map = new Map('planar', null, extent, { maxSubdivisionLevel: 10 });
     * instance.add(map);
     * @api
     */
    constructor(viewerDiv, options = {}) {
        super();
        Object3D.DefaultUp.set(0, 0, 1);
        if (!viewerDiv) {
            throw new Error('Invalid viewerDiv parameter (must non be null/undefined)');
        }

        this.referenceCrs = options.crs || 'EPSG:3857';

        if (options.mainLoop) {
            this.mainLoop = options.mainLoop;
        } else {
            let engine;

            // options.renderer can be 2 separate things:
            //   - an actual renderer (in this case we don't use viewerDiv)
            //   - options for the renderer to be created
            if (options.renderer && options.renderer.domElement) {
                engine = new C3DEngine(options.renderer);
            } else {
                engine = new C3DEngine(viewerDiv, options.renderer);
            }
            this.mainLoop = new MainLoop(new Scheduler(), engine);
        }

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
                this.dispatchEvent({ type: INSTANCE_EVENTS.LAYERS_INITIALIZED });
                this.removeFrameRequester(
                    MAIN_LOOP_EVENTS.UPDATE_END, this._allLayersAreReadyCallback,
                );
            }
        };

        this.controls = null;
        this._controlFunctions = null;
    }

    /**
     * Add THREE object or Entity to the instance.
     * The entity `id` must be unique.
     *
     * @example
     * // Add Map to instance
     * instance.add(new Map('myMap', myMapExtent));
     *
     * // Add Map to instance then wait for the map to be ready.
     * instance.add(new Map('myMap', myMapExtent)).then(...);
     * @param {Object3D|Entity3D} object the object to add
     * @returns {Promise} a promise resolved with the new layer object when it is fully initialized
     * or rejected if any error occurred.
     * @api
     */
    add(object) {
        if (!(object instanceof Object3D) && !(object instanceof Entity3D)) {
            return Promise.reject(new Error('object is not an instance of THREE.Object3D or Giro3d.Entity3D'));
        }
        object._instance = this;

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
                    reject(new Error('Cant add Entity3D: missing a update function'));
                    return;
                }
                if (typeof (l.preUpdate) !== 'function') {
                    reject(new Error('Cant add Entity3D: missing a preUpdate function'));
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

            source.on('change', () => {
                // naive way of dealing with changes : remove everything and add everything back
                if (vector.object3d) {
                    this.threeObjects.remove(vector.object3d);
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
            });

            // default loader does not have a "success" callback. Instead openlayers tests for
            if (source.getFeatures().length > 0) {
                vector.object3d = convert(source.getFeatures());
                this.threeObjects.add(vector.object3d);
                this.notifyChange(vector.object3d, true);
                resolve(vector);
            } else {
                source.once('change', () => resolve(vector));
                source.loadFeatures(
                    [-Infinity, -Infinity, Infinity, Infinity],
                    undefined,
                    this.referenceCrs,
                );
            }
        });
    }

    /**
     * Notifies the scene it needs to be updated due to changes exterior to the
     * scene itself (e.g. camera movement).
     * non-interactive events (e.g: texture loaded)
     *
     * @param {*} changeSource the source of the change
     * @param {boolean} needsRedraw indicates if notified change requires a full scene redraw.
     */
    notifyChange(changeSource = undefined, needsRedraw = true) {
        if (changeSource) {
            this._changeSources.add(changeSource);
        }
        this.mainLoop.scheduleUpdate(this, needsRedraw);
    }

    /**
     * Registers a new coordinate reference system.
     * This should be done before creating the instance.
     * This method can be called several times to add multiple CRS.
     *
     * @api
     * @static
     * @example
     * // register the CRS first...
     * Instance.registerCRS(
     *  'EPSG:102115',
     *  '+proj=utm +zone=5 +ellps=clrk66 +units=m +no_defs +type=crs');
     *
     * // ...then create the instance
     * const instance = new Instance(div, { crs: 'EPSG:102115' });
     * @param {string} name the short name, or EPSG code to identify this CRS.
     * @param {string} value the proj string describing this CRS.
     */
    static registerCRS(name, value) {
        if (!name || name === '') {
            throw new Error('missing CRS name');
        }
        if (!value || value === '') {
            throw new Error('missing CRS PROJ string');
        }

        // define the CRS with PROJ
        proj4.defs(name, value);
        // register this CRS with OpenLayers
        register(proj4);
    }

    /**
     * Get all opjects, with an optional filter applied.
     * The filter method allows to get only a subset of objects
     *
     * @example
     * // get all objects
     * instance.getObjects();
     * // get one layer with id
     * instance.getObjects(obj => obj.id === 'itt');
     * @param {function(Entity3D):boolean} filter the optional query filter
     * @returns {Array<Layer>} an array containing the queried layers
     */
    getObjects(filter) {
        const result = [];
        for (const obj of this._objects) {
            if (!filter || filter(obj)) {
                result.push(obj);
            }
        }
        return result;
    }

    /**
     * Get all the layers attached to all the entities in this instance.
     *
     * @param {function(Layer):boolean} filter Optional filter function for attached layers
     * @returns {Array<Layer>} the layers attached to the geometry layers
     */
    getLayers(filter) {
        let result = [];
        for (const obj of this._objects) {
            result = result.concat(obj.getLayers(filter));
        }
        return result;
    }

    /**
     * @param {Layer} layer the layer to test
     * @returns {Entity3D} the parent entity of the given layer or null if no owner was found.
     */
    getOwner(layer) {
        for (const obj of this._objects) {
            for (const attached of obj._attachedLayers) {
                if (attached === layer) {
                    return obj;
                }
            }
        }
        return null;
    }

    /**
     * @name FrameRequester
     * @description
     * Method that will be called each time the <code>MainLoop</code> updates. This
     * function will be given as parameter the delta (in ms) between this update and
     * the previous one, and whether or not we just started to render again. This
     * update is considered as the "next" update if <code>instance.notifyChange</code>
     * was called during a precedent update. If <code>instance.notifyChange</code> has
     * been called by something else (other micro/macrotask, UI events etc...), then
     * this update is considered as being the "first". It can also receive optional
     * arguments, depending on the attach point of this function.  Currently only
     * <code>BEFORE_LAYER_UPDATE / AFTER_LAYER_UPDATE</code> attach points provide
     * an additional argument: the layer being updated.
     * <br><br>
     *
     * This means that if a <code>frameRequester</code> function wants to animate something, it
     * should keep on calling <code>instance.notifyChange</code> until its task is done.
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
     * @param {number} dt
     * @param {boolean} updateLoopRestarted
     * @param {...*} args
     */
    /**
     * Add a frame requester to this instance.
     *
     * FrameRequesters can activate the MainLoop update by calling instance.notifyChange.
     *
     * @api
     * @param {string} when decide when the frameRequester should be called during
     * the update cycle. Can be any of {@link module:Core/Instance.INSTANCE_EVENTS INSTANCE_EVENTS}.
     * @param {FrameRequester} frameRequester this function will be called at each
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
     * @param {string} when attach point of this requester. Can be any of
     * {@link MAIN_LOOP_EVENTS}.
     * @param {FrameRequester} frameRequester the frameRequester to remove
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
     * @param {string} when attach point of this (these) requester(s). Can be any
     * of {@link MAIN_LOOP_EVENTS}.
     * @param {number} dt delta between this update and the previous one
     * @param {boolean} updateLoopRestarted <code>true</code> if giro3d' update loop just restarted
     * @param {...*} args optional arguments
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
     *
     * @param {event} event event can be a MouseEvent or a TouchEvent
     * @param {number} touchIdx finger index when using a TouchEvent (default: 0)
     * @returns {Vector2} view coordinates (in pixels, 0-0 = top-left of the view)
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
     *
     * @param {event} event event can be a MouseEvent or a TouchEvent
     * @param {number} touchIdx finger index when using a TouchEvent (default: 0)
     * @returns {Vector2} NDC coordinates (x and y are [-1, 1])
     */
    eventToNormalizedCoords(event, touchIdx = 0) {
        return this.viewToNormalizedCoords(this.eventToViewCoords(event, touchIdx));
    }

    /**
     * Convert view coordinates to normalized coordinates (NDC)
     *
     * @param {Vector2} viewCoords (in pixels, 0-0 = top-left of the View)
     * @returns {Vector2} NDC coordinates (x and y are [-1, 1])
     */
    viewToNormalizedCoords(viewCoords) {
        _eventCoords.x = 2 * (viewCoords.x / this.camera.width) - 1;
        _eventCoords.y = -2 * (viewCoords.y / this.camera.height) + 1;
        return _eventCoords;
    }

    /**
     * Convert NDC coordinates to view coordinates
     *
     * @param {Vector2} ndcCoords the NDC coordinates to convert
     * @returns {Vector2} view coordinates (in pixels, 0-0 = top-left of the View)
     */
    normalizedToViewCoords(ndcCoords) {
        _eventCoords.x = (ndcCoords.x + 1) * 0.5 * this.camera.width;
        _eventCoords.y = (ndcCoords.y - 1) * -0.5 * this.camera.height;
        return _eventCoords;
    }

    /**
     * Return objects from some layers/objects3d under the mouse in this view.
     *
     * @param {object} mouseOrEvt mouse position in window coordinates (0, 0 = top-left)
     * or MouseEvent or TouchEvent
     * @param {number} radius picking will happen in a circle centered on mouseOrEvt. Radius
     * is the radius of this circle, in pixels
     * @param {...*} where where to look for objects. Can be either: empty (= look
     * in all layers with type === 'geometry'), layer ids or layers or a mix of all
     * the above.
     * @returns {Array} an array of objects. Each element contains at least an object
     * property which is the Object3D under the cursor. Then depending on the queried
     * layer/source, there may be additionnal properties (coming from THREE.Raycaster
     * for instance).
     * @example
     * instance.pickObjectsAt({ x, y })
     * instance.pickObjectsAt({ x, y }, 1, 'wfsBuilding')
     * instance.pickObjectsAt({ x, y }, 3, 'wfsBuilding', myLayer)
     */
    pickObjectsAt(mouseOrEvt, radius, ...where) {
        const results = [];
        const sources = where.length === 0
            ? this.getObjects().concat(this.threeObjects) : [...where];
        const mouse = (mouseOrEvt instanceof Event)
            ? this.eventToViewCoords(mouseOrEvt) : mouseOrEvt;
        radius = radius || 0;

        for (const source of sources) {
            if (source instanceof Entity3D
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
            } else if (source.isObject3D) {
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

    /**
     * This function allows to use three.js controls (files in `examples/{js,jsm}/controls` folder
     * of THREE.js) into giro3d 3D scene.
     *
     * Giro3d supports the controls that check the following assumptions:
     *
     * - they fire 'change' events when something happens
     * - they have an `update` method
     *
     * @param {object} controls An instance of a THREE controls
     * @api
     */
    useTHREEControls(controls) {
        if (this.controls) {
            return;
        }

        this._controlFunctions = {
            frameRequester: () => controls.update(),
            eventListener: () => this.notifyChange(this.camera.camera3D),
        };

        if (typeof controls.addEventListener === 'function') {
            controls.addEventListener('change', this._controlFunctions.eventListener);
        // Some THREE controls don't inherit of EventDispatcher
        } else {
            throw new Error(
                'Unsupported control class: only event dispatcher controls are supported.',
            );
        }

        this.addFrameRequester('before_camera_update', this._controlFunctions.frameRequester);

        this.controls = controls;
    }

    /**
     * Removes a THREE controls previously added. The controls won't be disable.
     */
    removeTHREEControls() {
        if (!this.controls) {
            return;
        }

        this.controls.removeEventListener('change', this._controlFunctions.eventListener);
        this.removeFrameRequester('before_camera_update', this._controlFunctions.frameRequester);

        this.controls = null;
        this._controlFunctions = null;
    }
}

const _syncEntityVisibility = function _syncEntityVisibility(entity, instance) {
    if (entity.object3d) {
        entity.object3d.visible = entity.visible;
    }

    if (entity.threejsLayer) {
        if (entity.visible) {
            instance.camera.camera3D.layers.enable(entity.threejsLayer);
        } else {
            instance.camera.camera3D.layers.disable(entity.threejsLayer);
        }
    }
};

function _preprocessObject(instance, obj, provider, parentLayer) {
    if (!(obj instanceof Layer) && !(obj instanceof Entity3D)) {
        const nlayer = new Layer(obj.id);
        // nlayer.id is read-only so delete it from layer before Object.assign
        const tmp = obj;
        delete tmp.id;
        obj = Object.assign(nlayer, obj);
        // restore layer.id in user provider layer object
        tmp.id = obj.id;
    }

    obj.options = obj.options || {};

    if (!obj.updateStrategy) {
        obj.updateStrategy = {
            type: STRATEGY_MIN_NETWORK_TRAFFIC,
        };
    }

    if (provider) {
        if (provider.tileInsideLimit) {
            obj.tileInsideLimit = provider.tileInsideLimit.bind(provider);
        }
        if (provider.getPossibleTextureImprovements) {
            obj.getPossibleTextureImprovements = provider
                .getPossibleTextureImprovements
                .bind(provider);
        }
        if (provider.tileTextureCount) {
            obj.tileTextureCount = provider.tileTextureCount.bind(provider);
        }
    }

    if (!obj.whenReady) {
        if (!obj.object3d) {
            // layer.threejsLayer *must* be assigned before preprocessing,
            // because TileProvider.preprocessDataLayer function uses it.
            obj.threejsLayer = instance.mainLoop.gfxEngine.getUniqueThreejsLayer();
        }
        let providerPreprocessing = Promise.resolve();
        if (provider && provider.preprocessDataLayer) {
            providerPreprocessing = provider.preprocessDataLayer(
                obj, instance, instance.mainLoop.scheduler, parentLayer,
            );
            if (!(providerPreprocessing && providerPreprocessing.then)) {
                providerPreprocessing = Promise.resolve();
            }
        }

        // the last promise in the chain must return the layer
        obj.whenReady = providerPreprocessing.then(() => {
            obj.ready = true;
            return obj;
        });
    }

    // probably not the best place to do this
    defineLayerProperty(obj, 'visible', true, () => _syncEntityVisibility(obj, instance));
    defineLayerProperty(obj, 'frozen', false);
    _syncEntityVisibility(obj, instance);
    return obj;
}

function objectIdToObject(instance, layerId) {
    const lookup = instance.getObjects(l => l.id === layerId);
    if (!lookup.length) {
        throw new Error(`Invalid layer id used as where argument (value = ${layerId})`);
    }
    return lookup[0];
}

export default Instance;
