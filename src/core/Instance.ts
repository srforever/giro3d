import {
    Scene, Group, EventDispatcher, Vector2, Vector3, Object3D, type Box3, type WebGLRenderer,
} from 'three';
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import Camera from '../renderer/Camera.js';
import C3DEngine, { type RendererOptions } from '../renderer/c3DEngine.js';
import type RenderingOptions from '../renderer/RenderingOptions.js';
import ObjectRemovalHelper from '../utils/ObjectRemovalHelper.js';
import MainLoop, { RenderingState } from './MainLoop';
import { type MainLoopFrameEvents } from './MainLoopEvents';
import Entity from '../entities/Entity';
import Entity3D from '../entities/Entity3D';
import Map from '../entities/Map';
import type PickOptions from './picking/PickOptions';
import type PickResult from './picking/PickResult';
import type Progress from './Progress';
import pickObjectsAt from './picking/PickObjectsAt';
import { isPickable } from './picking/Pickable';
import { isPickableFeatures } from './picking/PickableFeatures';

const vectors = {
    pos: new Vector3(),
    size: new Vector3(),
    evtToCanvas: new Vector2(),
    pickVec2: new Vector2(),
};

/**
 * Events supported by
 * [`Instance.addEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.addEventListener)
 * and
 * [`Instance.removeEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.removeEventListener)
 */
export interface InstanceEvents {
    /**
     * Fires when all the layers of the instance are considered initialized.
     * Initialized in this context means: all layers are ready to be
     * displayed (no pending network access, no visual improvement to be
     * expected, ...).
     * If you add new layers, the event will be fired again when all
     * layers are ready.
     */
    'layers-initialized': {},
    /**
     * Fires when an entity is added to the instance.
     */
    'entity-added': {},
    /**
     * Fires when an entity is removed from the instance.
     */
    'entity-removed': {},
}

/**
 * The names of events supported by
 * [`Instance.addEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.addEventListener)
 * and
 * [`Instance.removeEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.removeEventListener).
 *
 * @deprecated Use InstanceEvents instead.
 */
export const INSTANCE_EVENTS: Record<string, keyof InstanceEvents> = {
    LAYERS_INITIALIZED: 'layers-initialized',
    ENTITY_ADDED: 'entity-added',
    ENTITY_REMOVED: 'entity-removed',
} as const;

/** Options for creating Instance */
export interface InstanceOptions {
    /**
     * The coordinate reference system of the scene.
     * Must be a cartesian system.
     * Must first be registered via {@link Instance.registerCRS}
     */
    crs: string,
    /**
     * The [Three.js Scene](https://threejs.org/docs/#api/en/scenes/Scene) instance to use,
     * otherwise a default one will be constructed
     */
    scene3D?: Scene,
    /* Rendering options */
    renderer?: RendererOptions,
    /* Main loop */
    mainLoop?: MainLoop,
}

/**
 * Method that will be called each time the `MainLoop` updates.
 *
 * @param dt delta between this update and the previous one
 * @param updateLoopRestarted `true` if giro3d' update loop just restarted
 * @param args optional arguments
 */
export type FrameRequesterCallback = (
    dt: number,
    updateLoopRestarted: boolean,
    ...args: any
) => void;
export interface FrameRequesterObject {
    update: FrameRequesterCallback,
}
/**
 * Method that will be called each time the `MainLoop` updates.
 *
 * This function will be given as parameter the delta (in ms) between this update and
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
 */
export type FrameRequester = FrameRequesterCallback | FrameRequesterObject;

/**
 * Options for picking objects from the Giro3D {@link Instance}.
 */
export interface PickObjectsAtOptions extends PickOptions {
    /**
     * List of entities to pick from.
     * If not provided, will pick from all the objects in the scene.
     * Strings consist in the IDs of the object.
     */
    where?: (string | Object3D | Entity)[],
    /**
     * Indicates if the results should be sorted by distance, as Three.js raycasting does.
     * This prevents the `limit` option to be fully used as it is applied after sorting,
     * thus it may be slow and is disabled by default.
     *
     * @default false
     */
    sortByDistance?: boolean,
    /**
     * Indicates if features information are also retrieved from the picked object.
     * On complex objects, this may be slow, and therefore is disabled by default.
     *
     * @default false
     */
    pickFeatures?: boolean;
}

export interface CustomCameraControls {
    enabled: boolean;
}
export interface ThreeControls extends CustomCameraControls {
    update: () => void,
    addEventListener: (event: string, callback: any) => void,
    removeEventListener: (event: string, callback: any) => void,
}
interface ControlFunctions {
    frameRequester: FrameRequesterCallback,
    eventListener: () => void,
}

/**
 * The instance is the core component of Giro3D. It encapsulates the 3D scene,
 * the current camera and one or more {@link entities.Entity | entities},
 * such as a {@link entities.Map | Map}.
 *
 *     // example of Giro3D instantiation
 *     const instance = new Instance(viewerDiv, { crs: extent.crs() });
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
class Instance extends EventDispatcher<InstanceEvents> implements Progress {
    private readonly _referenceCrs: string;
    private readonly _viewport: HTMLDivElement;
    private readonly _mainLoop: MainLoop;
    private readonly _engine: C3DEngine;
    private readonly _scene: Scene;
    private readonly _threeObjects: Group;
    private readonly _camera: Camera;
    private _frameRequesters: Partial<Record<keyof MainLoopFrameEvents, FrameRequester[]>>;
    private _delayedFrameRequesterRemoval: {
        when: keyof MainLoopFrameEvents,
        frameRequester: FrameRequester
    }[];
    private readonly _objects: Entity[];
    private readonly _resizeObserver?: ResizeObserver;
    private _resizeTimeout?: string | number | NodeJS.Timeout;
    public readonly isDebugMode: boolean;
    private _allLayersAreReadyCallback: () => void;
    private _controls?: CustomCameraControls;
    private _controlFunctions?: ControlFunctions;
    private _isDisposing: boolean;

    /**
     * Constructs a giro3d Instance
     *
     * @param viewerDiv Where to instanciate the Three.js scene in the DOM
     * @param options Options
     * @example
     * const opts = {
     *  crs = exent.crs()
     * };
     * const instance = new Instance(viewerDiv, opts);
     * const map = new Map('myMap', null, extent, { maxSubdivisionLevel: 10 });
     * instance.add(map);
     */
    constructor(viewerDiv: HTMLDivElement, options: InstanceOptions) {
        super();
        Object3D.DEFAULT_UP.set(0, 0, 1);
        if (!viewerDiv || !(viewerDiv instanceof HTMLDivElement)) {
            throw new Error('Invalid viewerDiv parameter (must be a valid Element)');
        }
        if (viewerDiv.childElementCount > 0) {
            console.warn('viewerDiv has children; Giro3D expects an empty element - this can lead to unexpected behaviors');
        }

        if (!options.crs) {
            throw new Error('missing "crs" parameter');
        }
        this._referenceCrs = options.crs;
        this._viewport = viewerDiv;

        if (options.mainLoop) {
            this._mainLoop = options.mainLoop;
            this._engine = options.mainLoop.gfxEngine;
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
            this._mainLoop = new MainLoop(engine);
            this._engine = engine;
        }

        this._scene = options.scene3D || new Scene();
        // will contain simple three objects that need to be taken into
        // account, for example camera near / far calculation maybe it'll be
        // better to do the contrary: having a group where *all* the giro3d
        // object will be added, and traverse all other objects for near far
        // calculation but actually I'm not even sure near far calculation is
        // worthy of this.
        this._threeObjects = new Group();
        this._threeObjects.name = 'threeObjects';

        this._scene.add(this._threeObjects);
        if (!options.scene3D) {
            this._scene.matrixWorldAutoUpdate = false;
        }

        this._camera = new Camera(
            this._referenceCrs,
            this._engine.getWindowSize().x,
            this._engine.getWindowSize().y,
            options,
        );

        this._frameRequesters = {};
        this._objects = [];

        if (window.ResizeObserver) {
            this._resizeObserver = new ResizeObserver(() => {
                this._updateRendererSize(this.viewport);
            });
            this._resizeObserver.observe(viewerDiv);
        }

        // @ts-ignore
        if (__DEBUG__) {
            this.isDebugMode = true;
        } else {
            this.isDebugMode = false;
        }

        this._delayedFrameRequesterRemoval = [];

        this._allLayersAreReadyCallback = () => {
            const allReady = this.getObjects().every(obj => {
                if (obj instanceof Entity3D) {
                    return obj.ready && obj.getLayers().every(layer => layer.ready);
                }
                if (obj instanceof Entity) {
                    return obj.ready;
                }
                // Object 3d
                return true;
            });
            if (allReady
                && this._mainLoop.renderingState === RenderingState.RENDERING_PAUSED) {
                this.dispatchEvent({ type: 'layers-initialized' });
                this.removeFrameRequester('update_end', this._allLayersAreReadyCallback);
            }
        };

        this._controls = null;
        this._controlFunctions = null;
    }

    /** Gets the canvas that this instance renders into. */
    get domElement(): HTMLCanvasElement {
        return this._engine.renderer.domElement;
    }

    /** Gets the DOM element that contains the giro3d viewport. */
    get viewport(): HTMLDivElement {
        return this._viewport;
    }

    /** Gets the CRS used in this instance. */
    get referenceCrs(): string {
        return this._referenceCrs;
    }

    /** Gets whether at least one entity is currently loading data. */
    get loading(): boolean {
        const entities = this.getObjects(o => o instanceof Entity) as Entity[];
        return entities.some(e => e.loading);
    }

    /**
     * Gets the progress (between 0 and 1) of the processing of the entire instance.
     * This is the average of the progress values of all entities.
     * Note: This value is only meaningful is {@link loading} is `true`.
     * Note: if no entity is present in the instance, this will always return 1.
     */
    get progress(): number {
        const entities = this.getObjects(o => o instanceof Entity) as Entity[];
        if (entities.length === 0) {
            return 1;
        }
        const sum = entities.reduce((accum, entity) => accum + entity.progress, 0);
        return sum / entities.length;
    }

    /** Gets the main loop */
    get mainLoop(): MainLoop {
        return this._mainLoop;
    }

    /** Gets the rendering engine */
    get engine(): C3DEngine {
        return this._engine;
    }

    /**
     * Gets the rendering options.
     *
     * Note: you must call {@link notifyChange | notifyChange()} to take
     * the changes into account.
     */
    get renderingOptions(): RenderingOptions {
        return this._engine.renderingOptions;
    }

    /**
     * Gets the underlying WebGL renderer.
     *
     * @readonly
     */
    get renderer(): WebGLRenderer {
        return this._engine.renderer;
    }

    /** Gets the [3D Scene](https://threejs.org/docs/#api/en/scenes/Scene). */
    get scene(): Scene {
        return this._scene;
    }

    /** Gets the group containing native Three.js objects. */
    get threeObjects(): Group {
        return this._threeObjects;
    }

    /** Gets the Camera. */
    get camera(): Camera {
        return this._camera;
    }

    /** Gets the currently bound camera controls. */
    get controls(): CustomCameraControls | undefined {
        return this._controls;
    }

    /**
     * Sets custom camera controls.
     * Prefer {@link Instance.useTHREEControls} when possible.
     */
    set controls(controls: CustomCameraControls) {
        this._controls = controls;
    }

    private _doUpdateRendererSize(div: HTMLDivElement): void {
        this._engine.onWindowResize(div.clientWidth, div.clientHeight);
        this.notifyChange(this._camera.camera3D);
    }

    private _updateRendererSize(div: HTMLDivElement): void {
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
    dispose(): void {
        if (this._isDisposing) {
            return;
        }
        this._isDisposing = true;
        this._resizeObserver?.disconnect();
        this.removeTHREEControls();
        for (const obj of this.getObjects()) {
            this.remove(obj);
        }
        this._scene.remove(this._threeObjects);

        this._engine.dispose();
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
     * @param object the object to add
     * @returns a promise resolved with the new layer object when it is fully initialized
     * or rejected if any error occurred.
     */
    async add(object: Object3D | Entity): Promise<Object3D | Entity> {
        if (!object) {
            throw new Error('object is undefined');
        }

        if (!(object as Object3D).isObject3D && !(object as Entity).isEntity) {
            throw new Error('object is not an instance of THREE.Object3D or Giro3d.Entity');
        }
        // @ts-ignore
        object._instance = this;

        if ((object as Object3D).isObject3D) {
            // case of a simple THREE.js object3D
            const object3d = object as Object3D;
            this._threeObjects.add(object3d);
            this.notifyChange(object3d);
            return object3d;
        }

        // We know it's an Entity
        const entity = object as Entity;

        const duplicate = this.getObjects((l => l.id === object.id));
        if (duplicate.length > 0) {
            throw new Error(`Invalid id '${object.id}': id already used`);
        }

        entity.startPreprocess();

        this._objects.push(entity);
        await entity.whenReady;

        // TODO remove object from this._objects maybe ?
        if (typeof (entity.update) !== 'function') {
            throw new Error('Cant add Entity: missing a update function');
        }
        if (typeof (entity.preUpdate) !== 'function') {
            throw new Error('Cant add Entity: missing a preUpdate function');
        }

        if (entity instanceof Entity3D
            && entity.object3d
            && !entity.object3d.parent
            && entity.object3d !== this._scene
        ) {
            this._scene.add(entity.object3d);
        }

        this.notifyChange(object, false);
        const updateEndFR = this._frameRequesters.update_end;
        if (!updateEndFR || !updateEndFR.includes(this._allLayersAreReadyCallback)) {
            this.addFrameRequester('update_end', this._allLayersAreReadyCallback);
        }
        this.dispatchEvent({ type: 'entity-added' });
        return object;
    }

    /**
     * Removes the entity or THREE object from the scene.
     *
     * @param object the object to remove.
     */
    remove(object: Object3D | Entity): void {
        if ((object as Object3D).isObject3D) {
            this._threeObjects.remove(object as Object3D);
        } else if ((object as Entity3D).object3d) {
            const obj3d = (object as Entity3D).object3d;
            ObjectRemovalHelper.removeChildrenAndCleanupRecursively(object as Entity, obj3d);
            this._scene.remove(obj3d);
        }
        if (typeof (object as any).dispose === 'function') {
            (object as any).dispose();
        }
        if (object instanceof Entity) {
            const idx = this._objects.indexOf(object);
            if (idx >= 0) {
                this._objects.splice(idx, 1);
            }
        }
        this.notifyChange(this._camera.camera3D, true);
        this.dispatchEvent({ type: 'entity-removed' });
    }

    /**
     * Notifies the scene it needs to be updated due to changes exterior to the
     * scene itself (e.g. camera movement).
     * non-interactive events (e.g: texture loaded)
     *
     * @param changeSource the source of the change
     * @param needsRedraw indicates if notified change requires a full scene redraw.
     */
    notifyChange(changeSource: unknown = undefined, needsRedraw = true): void {
        this._mainLoop.scheduleUpdate(this, needsRedraw, changeSource);
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
     * @param name the short name, or EPSG code to identify this CRS.
     * @param value the proj string describing this CRS.
     */
    static registerCRS(name: string, value: string): void {
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
     * @param filter the optional query filter
     * @returns an array containing the queried objects
     */
    getObjects(filter?: (obj: Object3D | Entity) => boolean): (Object3D | Entity)[] {
        const result = [];
        for (const obj of this._objects) {
            if (!filter || filter(obj)) {
                result.push(obj);
            }
        }
        for (const obj of this._threeObjects.children) {
            if (!filter || filter(obj)) {
                result.push(obj);
            }
        }
        return result;
    }

    /**
     * Add a frame requester to this instance.
     *
     * FrameRequesters can activate the MainLoop update by calling instance.notifyChange.
     *
     * @param when decide when the frameRequester should be called during
     * the update cycle.
     * @param frameRequester this function will be called at each
     * MainLoop update with the time delta between last update, or 0 if the MainLoop
     * has just been relaunched.
     */
    addFrameRequester(
        when: keyof MainLoopFrameEvents,
        frameRequester: FrameRequesterCallback,
    ): void {
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
     * @param when attach point of this requester.
     * @param frameRequester the frameRequester to remove
     */
    removeFrameRequester(when: keyof MainLoopFrameEvents, frameRequester: FrameRequester): void {
        const index = this._frameRequesters[when].indexOf(frameRequester);
        if (index >= 0) {
            this._delayedFrameRequesterRemoval.push({ when, frameRequester });
        } else {
            console.error('Invalid call to removeFrameRequester: frameRequester isn\'t registered');
        }
    }

    private _executeFrameRequestersRemovals(): void {
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
     * Executes the camera update.
     * Internal use only.
     *
     * @ignore
     */
    execCameraUpdate() {
        const dim = this._engine.getWindowSize();
        this.camera.update(dim.x, dim.y);
    }

    /**
     * Executes the rendering.
     * Internal use only.
     *
     * @ignore
     */
    render() {
        this._engine.render(this._scene, this._camera.camera3D);
    }

    /**
     * Execute a frameRequester.
     *
     * @param when attach point of this (these) requester(s).
     * @param dt delta between this update and the previous one
     * @param updateLoopRestarted `true` if giro3d' update loop just restarted
     * @param args optional arguments
     */
    execFrameRequesters(
        when: keyof MainLoopFrameEvents,
        dt: number,
        updateLoopRestarted: boolean,
        ...args: any
    ) {
        if (when === 'update_start') {
            this._executeFrameRequestersRemovals();
        }

        if (!this._frameRequesters[when]) {
            return;
        }

        if (this._delayedFrameRequesterRemoval.length > 0) {
            this._executeFrameRequestersRemovals();
        }

        for (const frameRequester of this._frameRequesters[when]) {
            // TODO: Is FrameRequesterObject still supported?
            const callback = (frameRequester as FrameRequesterObject).update
                ?? (frameRequester as FrameRequesterCallback);
            callback(dt, updateLoopRestarted, args);
        }
    }

    /**
     * Extract canvas coordinates from a mouse-event / touch-event.
     *
     * @param event event can be a MouseEvent or a TouchEvent
     * @param target The target to set with the result.
     * @param touchIdx finger index when using a TouchEvent (default: 0)
     * @returns canvas coordinates (in pixels, 0-0 = top-left of the instance)
     */
    eventToCanvasCoords(event: MouseEvent | TouchEvent, target: Vector2, touchIdx = 0): Vector2 {
        if (window.TouchEvent && event instanceof TouchEvent) {
            const touchEvent = event as TouchEvent;
            const br = this.domElement.getBoundingClientRect();
            return target.set(
                touchEvent.touches[touchIdx].clientX - br.x,
                touchEvent.touches[touchIdx].clientY - br.y,
            );
        }

        const mouseEvent = event as MouseEvent;

        if (mouseEvent.target === this.domElement) {
            return target.set(mouseEvent.offsetX, mouseEvent.offsetY);
        }

        // Event was triggered outside of the canvas, probably a CSS2DElement
        const br = this.domElement.getBoundingClientRect();
        return target.set(
            mouseEvent.clientX - br.x, mouseEvent.clientY - br.y,
        );
    }

    /**
     * Extract normalized coordinates (NDC) from a mouse-event / touch-event.
     *
     * @param event event can be a MouseEvent or a TouchEvent
     * @param target The target to set with the result.
     * @param touchIdx finger index when using a TouchEvent (default: 0)
     * @returns NDC coordinates (x and y are [-1, 1])
     */
    eventToNormalizedCoords(
        event: MouseEvent | TouchEvent,
        target: Vector2,
        touchIdx = 0,
    ): Vector2 {
        return this.canvasToNormalizedCoords(
            this.eventToCanvasCoords(event, target, touchIdx),
            target,
        );
    }

    /**
     * Convert canvas coordinates to normalized device coordinates (NDC).
     *
     * @param canvasCoords (in pixels, 0-0 = top-left of the instance)
     * @param target The target to set with the result.
     * @returns NDC coordinates (x and y are [-1, 1])
     */
    canvasToNormalizedCoords(canvasCoords: Vector2, target: Vector2): Vector2 {
        target.x = 2 * (canvasCoords.x / this._camera.width) - 1;
        target.y = -2 * (canvasCoords.y / this._camera.height) + 1;
        return target;
    }

    /**
     * Convert NDC coordinates to canvas coordinates.
     *
     * @param ndcCoords the NDC coordinates to convert
     * @param target The target to set with the result.
     * @returns canvas coordinates (in pixels, 0-0 = top-left of the instance)
     */
    normalizedToCanvasCoords(ndcCoords: Vector2, target: Vector2): Vector2 {
        target.x = (ndcCoords.x + 1) * 0.5 * this._camera.width;
        target.y = (ndcCoords.y - 1) * -0.5 * this._camera.height;
        return target;
    }

    /**
     * Gets the object by it's id property.
     *
     * @param objectId Object id
     * @returns Object found
     * @throws Error if object cannot be found
     */
    private objectIdToObject(objectId: string | number): Object3D | Entity {
        const lookup = this.getObjects(l => l.id === objectId);
        if (!lookup.length) {
            throw new Error(`Invalid object id used as where argument (value = ${objectId})`);
        }
        return lookup[0];
    }

    /**
     * Return objects from some layers/objects3d under the mouse in this instance.
     *
     * @param mouseOrEvt mouse position in window coordinates, i.e [0, 0] = top-left,
     * or `MouseEvent` or `TouchEvent`
     * @param options Options
     * @returns An array of objects. Each element contains at least an object
     * property which is the Object3D under the cursor. Then depending on the queried
     * layer/source, there may be additionnal properties (coming from THREE.Raycaster
     * for instance).
     * If `options.pickFeatures` if `true`, `features` property may be set.
     * @example
     * instance.pickObjectsAt({ x, y })
     * instance.pickObjectsAt({ x, y }, { radius: 1, where: ['wfsBuilding'] })
     * instance.pickObjectsAt({ x, y }, { radius: 3, where: ['wfsBuilding', myLayer] })
     */
    pickObjectsAt(
        mouseOrEvt: Vector2 | MouseEvent | TouchEvent,
        options: PickObjectsAtOptions = {},
    ): PickResult[] {
        let results: PickResult[] = [];
        const sources = options.where && options.where.length > 0
            ? [...options.where] : this.getObjects();
        const mouse = (mouseOrEvt instanceof Event)
            ? this.eventToCanvasCoords(mouseOrEvt, vectors.evtToCanvas) : mouseOrEvt;
        const radius = options.radius ?? 0;
        const limit = options.limit ?? Infinity;
        const sortByDistance = options.sortByDistance ?? false;
        const pickFeatures = options.pickFeatures ?? false;

        for (const source of sources) {
            const object = (typeof (source) === 'string')
                ? this.objectIdToObject(source)
                : source;

            if (!(object as any).visible) {
                continue;
            }

            const pickOptions = {
                ...options,
                radius,
                limit: limit - results.length,
                vec2: vectors.pickVec2,
                sortByDistance: false,
            };
            if (sortByDistance) {
                pickOptions.limit = Infinity;
                pickOptions.pickFeatures = false;
            }

            if (isPickable(object)) {
                const res = object.pick(mouse, pickOptions);
                results.push(...res);
            } else if ((object as Object3D).isObject3D) {
                const res = pickObjectsAt(
                    this,
                    mouse,
                    object as Object3D,
                    pickOptions,
                );
                results.push(...res);
            }

            if (results.length >= limit && !sortByDistance) { break; }
        }

        if (sortByDistance) {
            results.sort((a, b) => (a.distance - b.distance));
            if (limit !== Infinity) {
                results = results.slice(0, limit);
            }
        }

        if (pickFeatures) {
            const pickFeaturesOptions = options;

            results.forEach(result => {
                if (result.entity && isPickableFeatures(result.entity)) {
                    result.entity.pickFeaturesFrom(result, pickFeaturesOptions);
                } else if (result.object && isPickableFeatures(result.object)) {
                    result.object.pickFeaturesFrom(result, pickFeaturesOptions);
                }
            });
        }

        return results;
    }

    /**
     * Moves the camera to look at an object.
     *
     * @param obj Object to look at
     */
    focusObject(obj: Object3D | Entity3D) {
        const cam = this._camera.camera3D;
        if (obj instanceof Map) {
            // Configure camera
            // TODO support different CRS
            const dim = obj.extent.dimensions();
            const positionCamera = obj.extent.centerAsVector3();
            positionCamera.z = Math.max(dim.x, dim.y);
            const lookat = positionCamera;
            lookat.z = 0; // TODO this supposes there is no terrain, nor z-displacement

            cam.position.copy(positionCamera);
            cam.lookAt(lookat);
            cam.updateMatrixWorld(true);
        } else if ((obj as any).getBoundingBox) {
            const box = (obj as any).getBoundingBox() as Box3;
            if (box && !box.isEmpty()) {
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
     * @param controls An instance of a THREE controls
     */
    useTHREEControls(controls: ThreeControls): void {
        if (this.controls) {
            return;
        }

        this._controlFunctions = {
            frameRequester: () => controls.update(),
            eventListener: () => this.notifyChange(this._camera.camera3D),
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

        this._controls = controls;
    }

    /**
     * Removes a THREE controls previously added. The controls won't be disable.
     */
    removeTHREEControls(): void {
        if (!this._controls) {
            return;
        }

        if (typeof (this._controls as ThreeControls).removeEventListener === 'function') {
            (this._controls as ThreeControls).removeEventListener('change', this._controlFunctions.eventListener);
            this.removeFrameRequester('before_camera_update', this._controlFunctions.frameRequester);
        }

        this._controls = null;
        this._controlFunctions = null;
    }
}

export default Instance;
