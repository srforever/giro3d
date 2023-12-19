/**
 * @module core/Instance
 */
import {
    Scene, Group, EventDispatcher, Vector2, Vector3, Object3D, Box3, WebGLRenderer,
} from 'three';
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import Camera from '../renderer/Camera.js';
import MainLoop, { MAIN_LOOP_EVENTS, RENDERING_PAUSED } from './MainLoop.js';
import C3DEngine from '../renderer/c3DEngine.js';
import Entity from '../entities/Entity';
import Picking from './Picking';
import ObjectRemovalHelper from '../utils/ObjectRemovalHelper.js';
import RenderingOptions from '../renderer/RenderingOptions.js';

const vectors = {
    pos: new Vector3(),
    size: new Vector3(),
    evtToCanvas: new Vector2(),
    pickVec2: new Vector2(),
};

/**
 * The names of events supported by
 * [`Instance.addEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.addEventListener)
 * and
 * [`Instance.removeEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.removeEventListener)
 *
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
     * @event Instance#layers-initialized
     */
    LAYERS_INITIALIZED: 'layers-initialized',

    /**
     * Fires when an entity is added to the instance.
     *
     * @event Instance#entity-added
     */
    ENTITY_ADDED: 'entity-added',

    /**
     * Fires when an entity is removed from the instance.
     *
     * @event Instance#entity-removed
     */
    ENTITY_REMOVED: 'entity-removed',
};

/**
 * The instance is the core component of Giro3D. It encapsulates the 3D scene,
 * the current camera and one or more {@link entities.Entity | entities},
 * such as a {@link entities.Map | Map}.
 *
 *     // example of Giro3D instantiation
 *     const instance = new Instance(viewerDiv, extent.crs(), {camera: camera})
 *     const map = new Map('myMap', null, extent, { maxSubdivisionLevel: 10 });
 *     instance.add(map);
 *
 *     // Bind an event listener on double click
 *     instance.domElement.addEventListener('dblclick', dblClickHandler);
 *
 *     // Get the camera position
 *     const myvector = instance.camera.camera3D.position;
 *     // Set the camera position
 *     instance.camera.camera3D.position.set(newPosition);
 *     instance.camera.camera3D.lookAt(lookAt);
 *
 */
class Instance extends EventDispatcher {
    /**
     * Constructs a giro3d Instance
     *
     * @param {HTMLElement} viewerDiv Where to instanciate the Three.js scene in the DOM
     * @param {object} [options] Optional properties.
     * @param {string} options.crs The coordinate reference system of the scene. Must be a
     * cartesian system.
     * @param {Scene} [options.scene3D] The [Three.js Scene](https://threejs.org/docs/#api/en/scenes/Scene) instance to use,
     * otherwise a default one will be constructed
     * @param {object} [options.renderer] The options for the renderer.
     * @param {number|boolean} [options.renderer.clearColor] The background color.
     * Can be a hex color or `false` for transparent backgrounds (requires alpha true).
     * @param {boolean} [options.renderer.alpha] Enables transparency (default true).
     * Not used if renderer is provided.
     * @param {boolean} [options.renderer.antialias] Enables antialiasing (default true).
     * Not used if renderer is provided.
     * @param {boolean} [options.renderer.colorManagement] Enables color management (default false).
     * Not used if renderer is provided.
     * @param {boolean} [options.renderer.checkShaderErrors=false] Enables shader validation. Note:
     * shader validation is a costly operation that should be disabled in production.
     * That can be toggled at any moment using the corresponding property in the
     * {@link module:core/Instance~Instance#renderer renderer}.
     * See the [Three.js documentation](https://threejs.org/docs/index.html?q=webglren#api/en/renderers/WebGLRenderer.debug)
     * for more information.
     * @param {boolean} [options.renderer.logarithmicDepthBuffer] Enables the
     * [logarithmic depth buffer](https://threejs.org/docs/#api/en/renderers/WebGLRenderer.logarithmicDepthBuffer)
     * (default false). Not used if renderer is provided.
     * @param {WebGLRenderer} [options.renderer.renderer] Custom renderer to be used.
     * If provided, it will be automatically added in the DOM in viewerDiv.
     * @example
     * const opts = {
     *  camera: camera,
     *  crs = exent.crs()
     * };
     * const instance = new Instance(viewerDiv, opts);
     * const map = new Map('myMap', null, extent, { maxSubdivisionLevel: 10 });
     * instance.add(map);
     */
    constructor(viewerDiv, options) {
        super();
        Object3D.DEFAULT_UP.set(0, 0, 1);
        if (!viewerDiv || !(viewerDiv instanceof Element)) {
            throw new Error('Invalid viewerDiv parameter (must be a valid Element)');
        }
        if (viewerDiv.childElementCount > 0) {
            console.warn('viewerDiv has children; Giro3D expects an empty element - this can lead to unexpected behaviors');
        }

        if (!options.crs) {
            throw new Error('missing "crs" parameter');
        }
        this.referenceCrs = options.crs;
        this._viewport = viewerDiv;
        /** @type {MainLoop} */
        this.mainLoop = null;

        if (options.mainLoop) {
            this.mainLoop = options.mainLoop;
        } else {
            // viewerDiv may have padding/borders, which is annoying when retrieving its size
            // Wrap our canvas in a new div so we make sure the display
            // is correct whatever the page layout is
            // (especially when skrinking so there is no scrollbar/bleading)
            this._viewport = document.createElement('div');
            this._viewport.style.position = 'relative';
            this._viewport.style.overflow = 'hidden'; // Hide overflow during resizing
            this._viewport.style.width = '100%'; // Make sure it fills the space
            this._viewport.style.height = '100%';
            viewerDiv.appendChild(this._viewport);

            const engine = new C3DEngine(this._viewport, options.renderer);
            this.mainLoop = new MainLoop(engine);
            /** @type {C3DEngine} */
            this.engine = engine;
        }

        /** @type {Scene} */
        this.scene = options.scene3D || new Scene();
        // will contain simple three objects that need to be taken into
        // account, for example camera near / far calculation maybe it'll be
        // better to do the contrary: having a group where *all* the giro3d
        // object will be added, and traverse all other objects for near far
        // calculation but actually I'm not even sure near far calculation is
        // worthy of this.
        this.threeObjects = new Group();
        this.threeObjects.name = 'threeObjects';

        this.scene.add(this.threeObjects);
        this.scene2D = new Scene();
        if (!options.scene3D) {
            this.scene.matrixWorldAutoUpdate = false;
        }

        /**
         * Gets the current camera.
         *
         * @type {Camera}
         */
        this.camera = new Camera(
            this.referenceCrs,
            this.mainLoop.gfxEngine.getWindowSize().x,
            this.mainLoop.gfxEngine.getWindowSize().y,
            options,
        );

        this._frameRequesters = { };
        this._objects = [];

        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this._updateRendererSize(this.viewport);
            });
            this.resizeObserver.observe(viewerDiv);
        }

        this._changeSources = new Set();

        if (__DEBUG__) {
            this.isDebugMode = true;
        }

        this._delayedFrameRequesterRemoval = [];

        this._allLayersAreReadyCallback = () => {
            const allReady = this.getObjects().every(obj => {
                if (!obj.getLayers) {
                    return obj.ready;
                }
                return obj.ready && obj.getLayers().every(layer => layer.ready);
            });
            if (allReady
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
     * Gets the canvas that this instance renders into.
     *
     * @type {HTMLCanvasElement}
     */
    get domElement() {
        return this.mainLoop.gfxEngine.renderer.domElement;
    }

    /**
     * Gets the DOM element that contains the giro3d viewport.
     *
     * @type {HTMLElement}
     */
    get viewport() {
        return this._viewport;
    }

    /**
     * Gets whether at least one entity is currently loading data.
     *
     */
    get loading() {
        const entities = this.getObjects(o => o instanceof Entity);
        return entities.some(e => e.loading);
    }

    /**
     * Gets the progress (between 0 and 1) of the processing of the entire instance.
     * This is the average of the progress values of all entities.
     * Note: This value is only meaningful is {@link loading} is `true`.
     * Note: if no entity is present in the instance, this will always return 1.
     *
     * @type {number}
     */
    get progress() {
        const entities = this.getObjects(o => o instanceof Entity);
        if (entities.length === 0) {
            return 1;
        }
        const sum = entities.reduce((accum, entity) => accum + entity.progress, 0);
        return sum / entities.length;
    }

    /**
     * Gets the rendering options.
     *
     * Note: you must call {@link notifyChange | notifyChange()} to take
     * the changes into account.
     *
     * @type {RenderingOptions}
     */
    get renderingOptions() {
        return this.mainLoop.gfxEngine.renderingOptions;
    }

    /**
     * Gets the underlying WebGL renderer.
     *
     * @type {WebGLRenderer}
     * @readonly
     */
    get renderer() {
        return this.mainLoop.gfxEngine.renderer;
    }

    _doUpdateRendererSize(div) {
        this.mainLoop.gfxEngine.onWindowResize(div.clientWidth, div.clientHeight);
        this.notifyChange(this.camera.camera3D);
    }

    _updateRendererSize(div) {
        // Each time a canvas is resized, its content is erased and must be re-rendered.
        // Since we are only interested in the last size, we must discard intermediate
        // resizes to avoid the flickering effect due to the canvas going blank.

        if (this._resizeTimeout) {
            // If there's already a timeout in progress, discard it
            clearTimeout(this._resizeTimeout);
        }

        // And add another one
        this._resizeTimeout = setTimeout(() => this._doUpdateRendererSize(div), 50);
    }

    /**
     * Dispose of this instance object. Free all memory used.
     *
     * Note: this *will not* dispose the following reusable objects:
     * - controls (because they can be attached and detached). For THREE.js controls, use
     * `controls.dispose()`
     * - Inspectors, use `inspector.detach()`
     * - any openlayers objects, please see their individual documentation
     *
     */
    dispose() {
        if (this._isDisposing) {
            console.warn('This instance is already in the process of being disposed');
            return;
        }
        this._isDisposing = true;
        this.resizeObserver?.disconnect();
        this.removeTHREEControls();
        for (const obj of this.getObjects()) {
            this.remove(obj);
        }
        this.scene.remove(this.threeObjects);

        this.mainLoop.gfxEngine.dispose();
        this.viewport.remove();
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
     * @param {Object3D|Entity} object the object to add
     * @returns {Promise} a promise resolved with the new layer object when it is fully initialized
     * or rejected if any error occurred.
     */
    add(object) {
        if (!(object instanceof Object3D) && !(object instanceof Entity)) {
            return Promise.reject(new Error('object is not an instance of THREE.Object3D or Giro3d.Entity'));
        }
        object._instance = this;

        return new Promise((resolve, reject) => {
            if (!object) {
                reject(new Error('object is undefined'));
                return;
            }

            if (object.isObject3D) {
                // case of a simple THREE.js object3D
                this.threeObjects.add(object);
                this.notifyChange(object);
                resolve(object);
                return;
            }

            const duplicate = this.getObjects((l => l.id === object.id));
            if (duplicate.length > 0) {
                reject(new Error(`Invalid id '${object.id}': id already used`));
                return;
            }

            object = _preprocessEntity(this, object);

            if (!object.projection) {
                object.projection = this.referenceCrs;
            }

            this._objects.push(object);
            object.whenReady.then(() => {
                // TODO remove object from this._objects maybe ?
                if (typeof (object.update) !== 'function') {
                    reject(new Error('Cant add Entity: missing a update function'));
                    return;
                }
                if (typeof (object.preUpdate) !== 'function') {
                    reject(new Error('Cant add Entity: missing a preUpdate function'));
                    return;
                }

                if (object.object3d && !object.object3d.parent && object.object3d !== this.scene) {
                    this.scene.add(object.object3d);
                }

                this.notifyChange(object, false);
                const updateEndFR = this._frameRequesters[MAIN_LOOP_EVENTS.UPDATE_END];
                if (!updateEndFR || updateEndFR.indexOf(this._allLayersAreReadyCallback) === -1) {
                    this.addFrameRequester(
                        MAIN_LOOP_EVENTS.UPDATE_END,
                        this._allLayersAreReadyCallback,
                    );
                }
                this.dispatchEvent({ type: INSTANCE_EVENTS.ENTITY_ADDED });
                resolve(object);
            }).catch(e => reject(e));
        });
    }

    /**
     * Removes the entity or THREE object from the scene.
     *
     * @param {Object3D|Entity} object the object to remove.
     */
    remove(object) {
        if (object.isObject3D) {
            this.threeObjects.remove(object);
        } else if (object.object3d) {
            ObjectRemovalHelper.removeChildrenAndCleanupRecursively(object, object.object3d);
            this.scene.remove(object.object3d);
        }
        if (typeof object.dispose === 'function') {
            object.dispose();
        }
        this._objects.splice(this._objects.indexOf(object), 1);
        this.notifyChange(this.camera.camera3D, true);
        this.dispatchEvent({ type: INSTANCE_EVENTS.ENTITY_REMOVED });
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
     * Get all objects, with an optional filter applied.
     * The filter method allows to get only a subset of objects
     *
     * @example
     * // get all objects
     * instance.getObjects();
     * // get one layer with id
     * instance.getObjects(obj => obj.id === 'itt');
     * @param {function(object):boolean} [filter] the optional query filter
     * @returns {Array<object>} an array containing the queried objects
     */
    getObjects(filter) {
        const result = [];
        for (const obj of this._objects) {
            if (!filter || filter(obj)) {
                result.push(obj);
            }
        }
        for (const obj of this.threeObjects.children) {
            if (!filter || filter(obj)) {
                result.push(obj);
            }
        }
        return result;
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
     * @param {string} when decide when the frameRequester should be called during
     * the update cycle. Can be any of {@link module:core/Instance.INSTANCE_EVENTS INSTANCE_EVENTS}.
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
     * @param {string} when attach point of this requester.
     * Can be any of {@link module:core/Instance.INSTANCE_EVENTS INSTANCE_EVENTS}.
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
     * @param {string} when attach point of this (these) requester(s).
     * Can be any of {@link module:core/Instance.INSTANCE_EVENTS INSTANCE_EVENTS}.
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
     * Extract canvas coordinates from a mouse-event / touch-event
     *
     * @param {event} event event can be a MouseEvent or a TouchEvent
     * @param {Vector2} target The target to set with the result.
     * @param {number} touchIdx finger index when using a TouchEvent (default: 0)
     * @returns {Vector2} canvas coordinates (in pixels, 0-0 = top-left of the instance)
     */
    eventToCanvasCoords(event, target, touchIdx = 0) {
        if (event.touches === undefined || !event.touches.length) {
            if (event.target === this.domElement) {
                return target.set(event.offsetX, event.offsetY);
            }

            // Event was triggered outside of the canvas, probably a CSS2DElement
            const br = this.domElement.getBoundingClientRect();
            return target.set(
                event.clientX - br.x, event.clientY - br.y,
            );
        }
        const br = this.domElement.getBoundingClientRect();
        return target.set(
            event.touches[touchIdx].clientX - br.x,
            event.touches[touchIdx].clientY - br.y,
        );
    }

    /**
     * Extract normalized coordinates (NDC) from a mouse-event / touch-event
     *
     * @param {event} event event can be a MouseEvent or a TouchEvent
     * @param {Vector2} target The target to set with the result.
     * @param {number} touchIdx finger index when using a TouchEvent (default: 0)
     * @returns {Vector2} NDC coordinates (x and y are [-1, 1])
     */
    eventToNormalizedCoords(event, target, touchIdx = 0) {
        return this.canvasToNormalizedCoords(
            this.eventToCanvasCoords(event, target, touchIdx),
            target,
        );
    }

    /**
     * Convert canvas coordinates to normalized device coordinates (NDC).
     *
     * @param {Vector2} canvasCoords (in pixels, 0-0 = top-left of the instance)
     * @param {Vector2} target The target to set with the result.
     * @returns {Vector2} NDC coordinates (x and y are [-1, 1])
     */
    canvasToNormalizedCoords(canvasCoords, target) {
        target.x = 2 * (canvasCoords.x / this.camera.width) - 1;
        target.y = -2 * (canvasCoords.y / this.camera.height) + 1;
        return target;
    }

    /**
     * Convert NDC coordinates to canvas coordinates
     *
     * @param {Vector2} ndcCoords the NDC coordinates to convert
     * @param {Vector2} target The target to set with the result.
     * @returns {Vector2} canvas coordinates (in pixels, 0-0 = top-left of the instance)
     */
    normalizedToCanvasCoords(ndcCoords, target) {
        target.x = (ndcCoords.x + 1) * 0.5 * this.camera.width;
        target.y = (ndcCoords.y - 1) * -0.5 * this.camera.height;
        return target;
    }

    /**
     * Return objects from some layers/objects3d under the mouse in this instance.
     *
     * @param {Vector2|MouseEvent|TouchEvent} mouseOrEvt mouse position in window coordinates, i.e
     * [0, 0] = top-left, or `MouseEvent` or `TouchEvent`
     * @param {object} [options] Optional properties.
     * @param {number} [options.radius=0] picking will happen in a circle centered on mouseOrEvt.
     * Radius is the radius of this circle, in pixels
     * @param {number} [options.limit=Infinity] maximum number of objects to return
     * @param {Array} [options.where] where to look for objects. Can be either: empty (= look
     * in all layers with type === 'geometry'), layer ids or layers or a mix of all
     * the above.
     * @param {object} [options.filter] Filter on resulting objects
     * @returns {Array} an array of objects. Each element contains at least an object
     * property which is the Object3D under the cursor. Then depending on the queried
     * layer/source, there may be additionnal properties (coming from THREE.Raycaster
     * for instance).
     * @example
     * instance.pickObjectsAt({ x, y })
     * instance.pickObjectsAt({ x, y }, { radius: 1, where: ['wfsBuilding'] })
     * instance.pickObjectsAt({ x, y }, { radius: 3, where: ['wfsBuilding', myLayer] })
     */
    pickObjectsAt(mouseOrEvt, options = {}) {
        const results = [];
        const sources = options.where && options.where.length > 0
            ? [...options.where] : this.getObjects().concat(this.threeObjects);
        const mouse = (mouseOrEvt instanceof Event)
            ? this.eventToCanvasCoords(mouseOrEvt, vectors.evtToCanvas) : mouseOrEvt;
        const radius = options.radius || 0;
        const limit = options.limit || Infinity;

        for (const source of sources) {
            const object = (typeof (source) === 'string')
                ? objectIdToObject(this, source)
                : source;

            if (!object.visible) {
                continue;
            }

            const pickOptions = {
                radius,
                limit, // Use same limit as requested, since we pass the results array
                filterCanvas: options.filterCanvas,
                filter: options.filter,
                vec2: vectors.pickVec2,
            };

            if (typeof object.pickObjectsAt === 'function') {
                // TODO ability to pick on a layer instead of a geometric object?
                object.pickObjectsAt(mouse, pickOptions, results);
            } else if (object.isObject3D) {
                Picking.pickObjectsAt(
                    this,
                    mouse,
                    object,
                    pickOptions,
                    results,
                );
            } else {
                throw new Error(`Invalid where arg (value = ${source}). Expected layers, layer ids or Object3Ds`);
            }
            if (results.length >= limit) { break; }
        }

        return results;
    }

    focusObject(obj) {
        const cam = this.camera.camera3D;
        if (obj instanceof Map) {
            // Configure camera
            // TODO support different CRS
            const dim = obj.extent.dimensions();
            const positionCamera = obj.extent.centerAsVector3();
            positionCamera.values[2] = Math.max(dim.x, dim.y);
            const lookat = positionCamera;
            lookat.z = 0; // TODO this supposes there is no terrain, nor z-displacement

            cam.position.copy(positionCamera);
            cam.lookAt(lookat);
            cam.updateMatrixWorld(true);
        } else if (obj.getBoundingBox) {
            /** @type {Box3} */
            const box = obj.getBoundingBox();
            if (box) {
                const center = box.getCenter(vectors.pos);
                const size = box.getSize(vectors.size);
                const positionCamera = center.clone();
                positionCamera.x = Math.max(size.x, size.y);
                cam.position.copy(positionCamera);
                cam.lookAt(center);
                cam.updateMatrixWorld(true);
            }
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

function _preprocessEntity(instance, obj) {
    obj.options = obj.options || {};

    let preprocessingPromise;
    if (obj.preprocess) {
        preprocessingPromise = obj.preprocess();
    }

    if (!preprocessingPromise) {
        preprocessingPromise = Promise.resolve();
    }

    // the last promise in the chain must return the layer
    obj.whenReady = preprocessingPromise.then(() => {
        obj.ready = true;
        return obj;
    });

    return obj;
}

function objectIdToObject(instance, objectId) {
    const lookup = instance.getObjects(l => l.id === objectId);
    if (!lookup.length) {
        throw new Error(`Invalid object id used as where argument (value = ${objectId})`);
    }
    return lookup[0];
}

export default Instance;
