import {
    Scene,
    Group,
    EventDispatcher,
    Vector2,
    Vector3,
    Object3D,
    type Box3,
    type WebGLRenderer,
    Clock,
} from 'three';
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import Camera, { type CameraOptions } from '../renderer/Camera';
import C3DEngine, { type RendererOptions } from '../renderer/c3DEngine';
import type RenderingOptions from '../renderer/RenderingOptions';
import MainLoop from './MainLoop';
import type Entity from '../entities/Entity';
import { isEntity } from '../entities/Entity';
import Entity3D, { isEntity3D } from '../entities/Entity3D';
import Map from '../entities/Map';
import type PickOptions from './picking/PickOptions';
import type PickResult from './picking/PickResult';
import type Progress from './Progress';
import pickObjectsAt from './picking/PickObjectsAt';
import { isPickable } from './picking/Pickable';
import { isPickableFeatures } from './picking/PickableFeatures';
import { isDisposable } from './Disposable';
import {
    createEmptyReport,
    getObject3DMemoryUsage,
    type GetMemoryUsageContext,
    type MemoryUsageReport,
} from './MemoryUsage';
import { GlobalRenderTargetPool } from '../renderer/RenderTargetPool';
import { GlobalCache } from './Cache';

const vectors = {
    pos: new Vector3(),
    size: new Vector3(),
    evtToCanvas: new Vector2(),
    pickVec2: new Vector2(),
};

/** Frame event payload */
export type FrameEventPayload = {
    /** Time elapsed since previous update loop, in milliseconds */
    dt: number;
    /** `true` if the update loop restarted */
    updateLoopRestarted: boolean;
};

/** Entity event payload */
export type EntityEventPayload = {
    /** Entity */
    entity: Entity;
};

/**
 * Events supported by
 * [`Instance.addEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.addEventListener)
 * and
 * [`Instance.removeEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.removeEventListener)
 */
export interface InstanceEvents {
    /**
     * Fires when an entity is added to the instance.
     */
    'entity-added': {
        /** empty */
    };
    /**
     * Fires when an entity is removed from the instance.
     */
    'entity-removed': {
        /** empty */
    };
    /**
     * Fires at the start of the update
     */
    'update-start': FrameEventPayload;
    /**
     * Fires before the camera update
     */
    'before-camera-update': { camera: Camera } & FrameEventPayload;
    /**
     * Fires after the camera update
     */
    'after-camera-update': { camera: Camera } & FrameEventPayload;
    /**
     * Fires before the entity update
     */
    'before-entity-update': EntityEventPayload & FrameEventPayload;
    /**
     * Fires after the entity update
     */
    'after-entity-update': EntityEventPayload & FrameEventPayload;
    /**
     * Fires before the render
     */
    'before-render': FrameEventPayload;
    /**
     * Fires after the render
     */
    'after-render': FrameEventPayload;
    /**
     * Fires at the end of the update
     */
    'update-end': FrameEventPayload;
    'picking-start': {
        /** empty */
    };
    'picking-end': {
        /**
         * The duration of the picking, in seconds.
         */
        elapsed: number;
        /**
         * The picking results.
         */
        results?: PickResult<unknown>[];
    };
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
    ENTITY_ADDED: 'entity-added',
    ENTITY_REMOVED: 'entity-removed',
} as const;

/** Options for creating Instance */
export interface InstanceOptions extends CameraOptions {
    /**
     * The coordinate reference system of the scene.
     * Must be a cartesian system.
     * Must first be registered via {@link Instance.registerCRS}
     */
    crs: string;
    /**
     * The [Three.js Scene](https://threejs.org/docs/#api/en/scenes/Scene) instance to use,
     * otherwise a default one will be constructed
     */
    scene3D?: Scene;
    /* Rendering options */
    renderer?: RendererOptions;
    /* Main loop */
    mainLoop?: MainLoop;
}

/**
 * Options for picking objects from the Giro3D {@link Instance}.
 */
export interface PickObjectsAtOptions extends PickOptions {
    /**
     * List of entities to pick from.
     * If not provided, will pick from all the objects in the scene.
     * Strings consist in the IDs of the object.
     */
    where?: (string | Object3D | Entity)[];
    /**
     * Indicates if the results should be sorted by distance, as Three.js raycasting does.
     * This prevents the `limit` option to be fully used as it is applied after sorting,
     * thus it may be slow and is disabled by default.
     *
     * @defaultValue false
     */
    sortByDistance?: boolean;
    /**
     * Indicates if features information are also retrieved from the picked object.
     * On complex objects, this may be slow, and therefore is disabled by default.
     *
     * @defaultValue false
     */
    pickFeatures?: boolean;
}

export interface CustomCameraControls {
    enabled: boolean;
}

export interface ThreeControls extends CustomCameraControls {
    update: () => void;
    addEventListener: (event: string, callback: unknown) => void;
    removeEventListener: (event: string, callback: unknown) => void;
}

interface ControlFunctions {
    update: () => void;
    eventListener: () => void;
}

function isObject3D(o: unknown): o is Object3D {
    return (o as Object3D).isObject3D;
}

/**
 * The instance is the core component of Giro3D. It encapsulates the 3D scene,
 * the current camera and one or more {@link Entity},
 * such as a {@link Map}.
 *
 * ```js
 * // example of Giro3D instantiation
 * const instance = new Instance(viewerDiv, { crs: extent.crs() });
 * const map = new Map('myMap', null, extent, { maxSubdivisionLevel: 10 });
 * instance.add(map);
 *
 * // Bind an event listener on double click
 * instance.domElement.addEventListener('dblclick', dblClickHandler);
 *
 * // Get the camera position
 * const myvector = instance.camera.camera3D.position;
 * // Set the camera position
 * instance.camera.camera3D.position.set(newPosition);
 * instance.camera.camera3D.lookAt(lookAt);
 * ```
 */
class Instance extends EventDispatcher<InstanceEvents> implements Progress {
    private readonly _referenceCrs: string;
    private readonly _viewport: HTMLDivElement;
    private readonly _mainLoop: MainLoop;
    private readonly _engine: C3DEngine;
    private readonly _scene: Scene;
    private readonly _threeObjects: Group;
    private readonly _camera: Camera;
    private readonly _entities: Set<Entity>;
    private readonly _resizeObserver?: ResizeObserver;
    private readonly _pickingClock: Clock;
    private readonly _onContextRestored: () => void;
    private readonly _onContextLost: () => void;
    private _resizeTimeout?: string | number | NodeJS.Timeout;
    private _controls?: CustomCameraControls;
    private _controlFunctions?: ControlFunctions;
    private _isDisposing = false;

    /**
     * Constructs a Giro3D Instance
     *
     * @param viewerDiv - Where to instanciate the Three.js scene in the DOM
     * @param options - Options
     *
     * ```js
     * const opts = {
     *  crs = exent.crs()
     * };
     * const instance = new Instance(viewerDiv, opts);
     * const map = new Map('myMap', null, extent, { maxSubdivisionLevel: 10 });
     * instance.add(map);
     * ```
     */
    constructor(viewerDiv: HTMLDivElement, options: InstanceOptions) {
        super();
        Object3D.DEFAULT_UP.set(0, 0, 1);
        if (!viewerDiv || !(viewerDiv instanceof HTMLDivElement)) {
            throw new Error('Invalid viewerDiv parameter (must be a valid Element)');
        }
        if (viewerDiv.childElementCount > 0) {
            console.warn(
                'viewerDiv has children; Giro3D expects an empty element - this can lead to unexpected behaviors',
            );
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
        // better to do the contrary: having a group where *all* the Giro3D
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

        this._entities = new Set();

        if (window.ResizeObserver) {
            this._resizeObserver = new ResizeObserver(() => {
                this._updateRendererSize(this.viewport);
            });
            this._resizeObserver.observe(viewerDiv);
        }

        this._controls = undefined;
        this._pickingClock = new Clock(false);

        this._onContextRestored = this.onContextRestored.bind(this);
        this._onContextLost = this.onContextLost.bind(this);
        this.domElement.addEventListener('webglcontextlost', this._onContextLost);
        this.domElement.addEventListener('webglcontextrestored', this._onContextRestored);
    }

    private onContextLost() {
        this.getEntities().forEach(entity => {
            if (isEntity3D(entity)) {
                entity.onRenderingContextLost({ canvas: this.domElement });
            }
        });
    }

    private onContextRestored() {
        this.getEntities().forEach(entity => {
            if (isEntity3D(entity)) {
                entity.onRenderingContextRestored({ canvas: this.domElement });
            }
        });
        this.notifyChange();
    }

    /** Gets the canvas that this instance renders into. */
    get domElement(): HTMLCanvasElement {
        return this._engine.renderer.domElement;
    }

    /** Gets the DOM element that contains the Giro3D viewport. */
    get viewport(): HTMLDivElement {
        return this._viewport;
    }

    /** Gets the CRS used in this instance. */
    get referenceCrs(): string {
        return this._referenceCrs;
    }

    /** Gets whether at least one entity is currently loading data. */
    get loading(): boolean {
        const entities = this.getEntities();
        return entities.some(e => e.loading);
    }

    /**
     * Gets the progress (between 0 and 1) of the processing of the entire instance.
     * This is the average of the progress values of all entities.
     * Note: This value is only meaningful is {@link loading} is `true`.
     * Note: if no entity is present in the instance, this will always return 1.
     */
    get progress(): number {
        const entities = this.getEntities();
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

        this.domElement.removeEventListener('webglcontextlost', this._onContextLost);
        this.domElement.removeEventListener('webglcontextrestored', this._onContextRestored);

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
     * @param object - the object to add
     * @returns a promise resolved with the new layer object when it is fully initialized
     * or rejected if any error occurred.
     */
    async add(object: Object3D | Entity): Promise<Object3D | Entity> {
        if (!object) {
            throw new Error('object is undefined');
        }

        if (!(object as Object3D).isObject3D && !(object as Entity).isEntity) {
            throw new Error('object is not an instance of THREE.Object3D or Giro3D.Entity');
        }
        // @ts-expect-error _instance does not exist on objects and entities // FIXME
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

        const duplicate = this.getObjects(l => l.id === object.id);
        if (duplicate.length > 0) {
            throw new Error(`Invalid id '${object.id}': id already used`);
        }

        entity.startPreprocess();

        this._entities.add(entity);
        await entity.whenReady;

        if (
            entity instanceof Entity3D &&
            entity.object3d &&
            !entity.object3d.parent &&
            entity.object3d !== this._scene
        ) {
            this._scene.add(entity.object3d);
        }

        this.notifyChange(object, false);
        this.dispatchEvent({ type: 'entity-added' });
        return object;
    }

    /**
     * Removes the entity or THREE object from the scene.
     *
     * @param object - the object to remove.
     */
    remove(object: Object3D | Entity): void {
        if (isEntity(object)) {
            object.dispose();

            if (isEntity3D(object)) {
                this._scene.remove(object.object3d);
            }

            this._entities.delete(object);

            this.dispatchEvent({ type: 'entity-removed' });
        } else if (isObject3D(object)) {
            if (isDisposable(object)) {
                object.dispose();
            }

            this._threeObjects.remove(object);
        }

        this.notifyChange(this._camera.camera3D, true);
    }

    /**
     * Notifies the scene it needs to be updated due to changes exterior to the
     * scene itself (e.g. camera movement).
     * non-interactive events (e.g: texture loaded)
     *
     * @param changeSources - the source(s) of the change. Might be a single object or an array.
     * @param needsRedraw - indicates if notified change requires a full scene redraw.
     */
    notifyChange(changeSources: unknown | unknown[] = undefined, needsRedraw = true): void {
        this._mainLoop.scheduleUpdate(this, needsRedraw, changeSources);
    }

    /**
     * Registers a new coordinate reference system.
     * This should be done before creating the instance.
     * This method can be called several times to add multiple CRS.
     *
     * ```
     *  // register the CRS first...
     *  Instance.registerCRS(
     *  'EPSG:102115',
     *  '+proj=utm +zone=5 +ellps=clrk66 +units=m +no_defs +type=crs');
     *
     *  // ...then create the instance
     *  const instance = new Instance(div, { crs: 'EPSG:102115' });
     * ```
     *
     * @param name - the short name, or EPSG code to identify this CRS.
     * @param value - the CRS definition, either in proj syntax, or in WKT syntax.
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
     * Get all top-level objects (entities and regular THREE objects), using an optional filter
     * predicate.
     *
     * ```js
     * // get all objects
     * const allObjects = instance.getObjects();
     * // get all object whose name includes 'foo'
     * const fooObjects = instance.getObjects(obj => obj.name === 'foo');
     * ```
     * @param filter - the optional filter predicate.
     * @returns an array containing the queried objects
     */
    getObjects(filter?: (obj: Object3D | Entity) => boolean): (Object3D | Entity)[] {
        const result = [];
        for (const obj of this._entities) {
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
     * Get all entities, with an optional predicate applied.
     *
     * ```js
     * // get all entities
     * const allEntities = instance.getEntities();
     *
     * // get all entities whose name contains 'building'
     * const buildings = instance.getEntities(entity => entity.name.includes('building'));
     * ```
     * @param filter - the optional filter predicate
     * @returns an array containing the queried entities
     */
    getEntities(filter?: (obj: Entity) => boolean): Entity[] {
        const result = [];

        for (const obj of this._entities) {
            if (!filter || filter(obj)) {
                result.push(obj);
            }
        }

        return result;
    }

    /**
     * Executes the camera update.
     * Internal use only.
     *
     * @internal
     */
    execCameraUpdate() {
        const dim = this._engine.getWindowSize();
        this.camera.update(dim.x, dim.y);
    }

    /**
     * Executes the rendering.
     * Internal use only.
     *
     * @internal
     */
    render() {
        this._engine.render(this._scene, this._camera.camera3D);
    }

    /**
     * Extract canvas coordinates from a mouse-event / touch-event.
     *
     * @param event - event can be a MouseEvent or a TouchEvent
     * @param target - The target to set with the result.
     * @param touchIdx - Touch index when using a TouchEvent (default: 0)
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
        return target.set(mouseEvent.clientX - br.x, mouseEvent.clientY - br.y);
    }

    /**
     * Extract normalized coordinates (NDC) from a mouse-event / touch-event.
     *
     * @param event - event can be a MouseEvent or a TouchEvent
     * @param target - The target to set with the result.
     * @param touchIdx - Touch index when using a TouchEvent (default: 0)
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
     * @param canvasCoords - (in pixels, 0-0 = top-left of the instance)
     * @param target - The target to set with the result.
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
     * @param ndcCoords - The NDC coordinates to convert
     * @param target - The target to set with the result.
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
     * @param objectId - Object id
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
     * @param mouseOrEvt - mouse position in window coordinates, i.e [0, 0] = top-left,
     * or `MouseEvent` or `TouchEvent`
     * @param options - Options
     * @returns An array of objects. Each element contains at least an object
     * property which is the Object3D under the cursor. Then depending on the queried
     * layer/source, there may be additionnal properties (coming from THREE.Raycaster
     * for instance).
     * If `options.pickFeatures` if `true`, `features` property may be set.
     * ```js
     * instance.pickObjectsAt({ x, y })
     * instance.pickObjectsAt({ x, y }, { radius: 1, where: ['wfsBuilding'] })
     * instance.pickObjectsAt({ x, y }, { radius: 3, where: ['wfsBuilding', myLayer] })
     * ```
     */
    pickObjectsAt(
        mouseOrEvt: Vector2 | MouseEvent | TouchEvent,
        options: PickObjectsAtOptions = {},
    ): PickResult[] {
        this.dispatchEvent({ type: 'picking-start' });
        this._pickingClock.start();

        let results: PickResult[] = [];
        const sources =
            options.where && options.where.length > 0 ? [...options.where] : this.getObjects();
        const mouse =
            mouseOrEvt instanceof Event
                ? this.eventToCanvasCoords(mouseOrEvt, vectors.evtToCanvas)
                : mouseOrEvt;
        const radius = options.radius ?? 0;
        const limit = options.limit ?? Infinity;
        const sortByDistance = options.sortByDistance ?? false;
        const pickFeatures = options.pickFeatures ?? false;

        for (const source of sources) {
            const object = typeof source === 'string' ? this.objectIdToObject(source) : source;

            if (!(object as Object3D | Entity3D).visible) {
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
                const res = pickObjectsAt(this, mouse, object as Object3D, pickOptions);
                results.push(...res);
            }

            if (results.length >= limit && !sortByDistance) {
                break;
            }
        }

        if (sortByDistance) {
            results.sort((a, b) => a.distance - b.distance);
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

        const elapsed = this._pickingClock.getElapsedTime();
        this._pickingClock.stop();
        this.dispatchEvent({ type: 'picking-end', elapsed, results });

        return results;
    }

    /**
     * Moves the camera to look at an object.
     *
     * @param obj - Object to look at
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
        } else if ('getBoundingBox' in obj && typeof obj.getBoundingBox === 'function') {
            const box = obj.getBoundingBox() as Box3;
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

    getMemoryUsage(): MemoryUsageReport {
        const context: GetMemoryUsageContext = {
            renderer: this.renderer,
        };
        const result = createEmptyReport();

        for (const entity of this._entities) {
            if (isEntity3D(entity)) {
                entity.getMemoryUsage(context, result);
            }
        }

        this.threeObjects.traverse(obj => {
            getObject3DMemoryUsage(obj, context, result);
        });

        GlobalRenderTargetPool.getMemoryUsage(context, result);

        GlobalCache.getMemoryUsage(context, result);

        return result;
    }

    /**
     * This function allows to use three.js controls (files in `examples/{js,jsm}/controls` folder
     * of THREE.js) into Giro3D 3D scene.
     *
     * Giro3D supports the controls that check the following assumptions:
     *
     * - they fire 'change' events when something happens
     * - they have an `update` method
     *
     * @param controls - An instance of a THREE controls
     */
    useTHREEControls(controls: ThreeControls): void {
        if (this.controls) {
            return;
        }

        this._controlFunctions = {
            eventListener: () => this.notifyChange(this._camera.camera3D),
            update: () => this.updateControls(),
        };

        this._controls = controls;
        if (typeof controls.addEventListener === 'function') {
            controls.addEventListener('change', this._controlFunctions.eventListener);
            this.addEventListener('before-camera-update', this._controlFunctions.update);
            // Some THREE controls don't inherit of EventDispatcher
        } else {
            throw new Error(
                'Unsupported control class: only event dispatcher controls are supported.',
            );
        }
    }

    /**
     * Removes a THREE controls previously added. The controls won't be disable.
     */
    removeTHREEControls(): void {
        if (!this._controls || !this._controlFunctions) {
            return;
        }

        if (typeof (this._controls as ThreeControls).removeEventListener === 'function') {
            (this._controls as ThreeControls).removeEventListener(
                'change',
                this._controlFunctions.eventListener,
            );
            this.removeEventListener('before-camera-update', this._controlFunctions.update);
        }

        this._controls = undefined;
        this._controlFunctions = undefined;
    }

    private updateControls() {
        if (typeof (this._controls as ThreeControls).update === 'function') {
            (this._controls as ThreeControls).update();
        }
    }
}

export default Instance;
