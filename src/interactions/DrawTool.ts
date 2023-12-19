import {
    BoxGeometry,
    EventDispatcher,
    Group,
    Line3,
    Mesh,
    MeshBasicMaterial,
    Quaternion,
    Raycaster,
    Vector2,
    Vector3,
} from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type Instance from '../core/Instance';
import Drawing, { GEOMETRY_TYPE, type DrawingOptions, type DrawingGeometryType } from './Drawing';
import PromiseUtils from '../utils/PromiseUtils.js';

/**
 * Types of geometries to draw - for backward compatibility.
 *
 * @deprecated Use {@link DrawingGeometryType} instead
 */
export { GEOMETRY_TYPE };

/**
 * Events fired by {@link DrawTool}.
 */
export interface DrawToolEventMap {
    /** Fires when the tool becomes active */
    'start': {},
    /** Fires when the shape is being edited (including mouse move) */
    'drawing': {},
    /** Fires when a point has been added */
    'add': {
        /** Coordinates */
        at: Vector3,
        /** Index of the point added in the geometry */
        index: number,
    },
    /** Fires when a point has been edited */
    'edit': {
        /** Coordinates */
        at: Vector3,
        /** Index of the point edited in the geometry */
        index: number,
    },
    /** Fires when a point has been deleted */
    'delete': {
        /** Index of the point deleted */
        index: number
    },
    /** Fires when the drawing has ended */
    'end': {
        /** GeoJSON object representing the geometry drawn */
        geojson: GeoJSON.Geometry,
    },
    /** Fires when the drawing has been aborted */
    'abort': {},
}

/**
 * Events fired by {@link DrawTool}.
 *
 * @deprecated Use {@link DrawToolEventMap} instead.
 */
export const DRAWTOOL_EVENT_TYPE: Record<string, keyof DrawToolEventMap> = {
    START: 'start',
    DRAWING: 'drawing',
    ADD: 'add',
    EDIT: 'edit',
    DELETE: 'delete',
    END: 'end',
    ABORT: 'abort',
} as const;

/**
 * State of the {@link DrawTool} object.
 */
export enum DrawToolState {
    /**
     * Initialized but inactive. Call
     * {@link DrawTool#start DrawTool.start()} or {@link DrawTool#edit DrawTool.edit()} to begin.
     */
    READY = 'ready',
    /**
     * A drawing is being performed. You can call:
     * - {@link DrawTool#end DrawTool.end()} to end,
     * - {@link DrawTool#reset DrawTool.reset()} to abort,
     * - {@link DrawTool#pause DrawTool.pause()} to pause (during camera move for instance)
     */
    ACTIVE = 'active',
    /**
     * A drawing is being performed but paused (no events handled). You can call:
     * - {@link DrawTool#end DrawTool.end()} to end,
     * - {@link DrawTool#reset DrawTool.reset()} to abort,
     * - {@link DrawTool#continue DrawTool.continue()} to continue.
     */
    PAUSED = 'paused',
}

/**
 * State of the {@link DrawTool} object.
 *
 * @deprecated Use {@link DrawToolState} instead.
 */
export const DRAWTOOL_STATE = {
    READY: DrawToolState.READY,
    ACTIVE: DrawToolState.ACTIVE,
    PAUSED: DrawToolState.PAUSED,
} as const;

/**
 * Internal state for the tool.
 */
enum DrawToolInternalState {
    /** Nothing to do */
    NOOP = 'noop',
    /** Started dragging, but not moved yet */
    DRAGGING_STARTED = 'dragging_started',
    /** Dragging and moved */
    DRAGGING = 'dragging',
    /** Ready to add a new point */
    NEW_POINT = 'new_point',
    /** Hovering a point (for dragging) */
    OVER_POINT = 'over_point',
    /** Hovering an edge (for splicing) */
    OVER_EDGE = 'over_edge',
}

/**
 * Edition mode of the {@link DrawTool} object.
 */
export enum DrawToolMode {
    /** Creating a new shape */
    CREATE = 'create',
    /** Editing a shape */
    EDIT = 'edit',
}

/**
 * Edition mode of the {@link DrawTool} object.
 *
 * @deprecated Use {@link DrawToolMode} instead.
 */
export const DRAWTOOL_MODE = {
    CREATE: DrawToolMode.CREATE,
    EDIT: DrawToolMode.EDIT,
} as const;

const raycaster = new Raycaster();
const tmpVec2 = new Vector2();

const emptyMaterial = new MeshBasicMaterial();
const tmpQuat = new Quaternion();
const unitVector = new Vector3(1, 0, 0);
const tmpVec3 = new Vector3();

/**
 * Callback to create a HTML element for points for CSS2DObject
 *
 * @param text Text to display
 * @returns HTML Element for the point
 */
export type Point2DFactory = (text: string) => HTMLElement;

export type PickedResult = {
    point: Vector3;
    picked: boolean;
};

/**
 * Method to get the X,Y,Z coordinates corresponding to where the user clicked.
 *
 * Must return:
 * - if a point is found, an object with the following properties:
 *   - `point`: `Vector3`
 *   - `picked`: `boolean`, `true` if correspond to real data, `false` if interpolated
 * - if no point is found, `null`
 *
 * @param evt Mouse event
 * @returns Result object
 */
export type GetPointAtCallback = (evt: MouseEvent) => PickedResult | null;

export interface DrawToolOptions {
    /**
     * The number of points that can be drawn before a polygon or line is finished.
     *
     * @default Infinity
     */
    maxPoints?: number,
    /**
     * The number of points that must be drawn before a polygon or line can be finished.
     *
     * @default 1 (for points), 2 (for lines) or 3 (for polygons)
     */
    minPoints?: number,
    /** Callback to get the point from where the user clicked. */
    getPointAt?: GetPointAtCallback,
    /** Callback to create DOM elements at points. */
    point2DFactory?: Point2DFactory,
    /** Options for creating GeometryObject */
    drawObjectOptions?: DrawingOptions,
    /**
     * Capture right-click to end the drawing.
     *
     * @default true
     */
    endDrawingOnRightClick?: boolean,
    /**
     * Enables splicing edges
     *
     * @default true
     */
    enableSplicing?: boolean,
    /** Hit tolerance for splicing (`null` for auto) */
    splicingHitTolerance?: number | null,
    /**
     * Enables adding points for line/multipoint geometries when editing
     *
     * @default true
     */
    enableAddPointsOnEdit?: boolean,
    /**
     * Edit points via drag-and-drop (otherwise, moving a point is on click)
     *
     * @default true
     */
    enableDragging?: boolean,
}

type EventListener<K extends keyof HTMLElementEventMap> = (ev: HTMLElementEventMap[K]) => any;
type EventListenersMap = {
    mousedown: EventListener<'mousedown'>;
    mouseup: EventListener<'mouseup'>;
    mousemove: EventListener<'mousemove'>;
    contextmenu: EventListener<'contextmenu'>;
};

class Edge extends Mesh {
    edgeIndex: number;
    line: Line3;
}

/**
 * Enables the user to draw on the map.
 *
 * @example
 * // example of Giro3D instantiation
 * const instance = new Instance(viewerDiv, options)
 * const map = new Map('myMap', { extent });
 * instance.add(map);
 *
 * // Add our tool
 * const drawTool = new DrawTool(instance);
 *
 * // Start and wait for result
 * drawTool.startAsAPromise()
 *    .then((polygon) => {
 *        // Use generated polygon as GeoJSON
 *    })
 * // Or use events
 * drawTool.addEventListener('end', (polygon) => {
 *     // Use generated polygon as GeoJSON
 * })
 * drawTool.start();
 */
class DrawTool extends EventDispatcher<DrawToolEventMap> {
    private _instance: Instance;
    private _drawObject: Drawing | null;
    private _pointsGroup: Group | null;
    private _state: DrawToolState;
    private _mode: DrawToolMode | null;
    private _maxPoints: number | null;
    private _minPoints: number | null;
    private _getPointAt: GetPointAtCallback;
    private _point2DFactory: Point2DFactory;
    private _drawObjectOptions: DrawingOptions;
    private _endDrawingOnRightClick: boolean;
    private _enableSplicing: boolean;
    private _splicingHitTolerance: number | null;
    private _enableDragging: boolean;
    private _enableAddPointsOnEdit: boolean;

    private _oldState: DrawToolInternalState | null;
    private _internalState: DrawToolInternalState | null;
    private _realMinPoints: number | null;
    private _realMaxPoints: number | null;
    private _coordinates: [number, number, number][];
    private _canAddNewPoint: boolean | null;
    private _nextPoint3D: CSS2DObject | null;
    private _nextPointCoordinates: [number, number, number] | null;
    private _canSplice: boolean | null;
    private _splicingPoint3D: CSS2DObject | null;
    private _splicingPointEdge: number | null;
    private _splicingPointCoordinates: Vector3 | null;
    private _draggedPointIndex: number | null;
    private _edges: Group | null;
    private _geometryType: DrawingGeometryType;
    private _eventHandlers: EventListenersMap | null;
    private _resolve: ((value: GeoJSON.Geometry) => void) | undefined;
    private _reject: ((reason?: any) => void) | undefined;

    /** Object currently being drawn */
    public get drawObject(): Drawing | null { return this._drawObject; }
    /** State of the tool */
    public get state(): DrawToolState { return this._state; }
    /** Mode of the tool (null if inactive) */
    public get mode(): DrawToolMode | null { return this._mode; }

    /**
     * Constructs a DrawTool
     *
     * @param instance Giro3D instance
     * @param options Options
     */
    constructor(instance: Instance, options: DrawToolOptions = {}) {
        super();
        this._instance = instance;
        this.setOptions(options);

        this._drawObject = null;
        this._pointsGroup = null;
        this._state = DrawToolState.READY;
        this._mode = null;
    }

    /**
     * Utility function to set options.
     *
     * @param options See constructor
     */
    setOptions(options: DrawToolOptions): this {
        this._maxPoints = options.maxPoints ?? Infinity;
        this._minPoints = options.minPoints ?? null;
        this._getPointAt = options.getPointAt ?? this._defaultPickPointAt.bind(this);
        this._point2DFactory = options.point2DFactory ?? this._defaultPoint2DFactory.bind(this);
        this._drawObjectOptions = options.drawObjectOptions ?? {};
        this._endDrawingOnRightClick = options.endDrawingOnRightClick ?? true;
        this._enableSplicing = options.enableSplicing ?? true;
        this._splicingHitTolerance = options.splicingHitTolerance ?? null;
        this._enableDragging = options.enableDragging ?? true;
        this._enableAddPointsOnEdit = options.enableAddPointsOnEdit ?? true;
        return this;
    }

    /// DEFAULT CALLBACKS

    /**
     * Default picking callback.
     *
     * @param evt Mouse event
     * @returns Object
     */
    private _defaultPickPointAt(evt: MouseEvent): PickedResult {
        const picked = this._instance.pickObjectsAt(evt, {
            radius: 5,
            limit: 1,
        });
        if (picked.length > 0) {
            // We found an object on click, return its position
            const s = picked[0].point.clone();
            return { ...picked[0], point: s, picked: true };
        }

        return null;
    }

    /**
     * Default Point2D factory for creating labels for editing edges.
     *
     * @param text Label to display
     * @returns DOM Element to attach to the CSS2DObject
     */
    // eslint-disable-next-line class-methods-use-this
    private _defaultPoint2DFactory(text: string): HTMLElement {
        const pt = document.createElement('div');
        pt.style.position = 'absolute';
        pt.style.borderRadius = '50%';
        pt.style.width = '28px';
        pt.style.height = '28px';
        pt.style.backgroundColor = '#070607';
        pt.style.color = '#ffffff';
        pt.style.border = '2px solid #ebebec';
        pt.style.fontSize = '14px';
        pt.style.fontWeight = 'bold';
        pt.style.textAlign = 'center';
        pt.style.pointerEvents = 'none';
        pt.innerText = text;
        return pt;
    }

    /// PUBLIC FUNCTIONS

    /**
     * Starts a new drawing.
     *
     * Fires {@link DrawToolEventMap.start} event at start.
     *
     * @param geometryType Geometry type to draw
     */
    start(geometryType: DrawingGeometryType = 'Polygon'): void {
        if (this._state !== DrawToolState.READY) {
            throw new Error('Cannot start drawing: already drawing');
        }

        this._init(DrawToolMode.CREATE, geometryType, null);

        this._state = DrawToolState.ACTIVE;
        this.dispatchEvent({ type: 'start' });
    }

    /**
     * Starts a new drawing and returns a promise.
     *
     * Fires {@link DrawToolEventMap.start} event at start.
     *
     * @param geometryType Geometry type to draw
     * @returns Promise resolving to the GeoJSON geometry drawn
     */
    startAsAPromise(
        geometryType: DrawingGeometryType = 'Polygon',
    ): Promise<GeoJSON.Geometry> {
        return new Promise((resolveFn, rejectFn) => {
            this._resolve = resolveFn;
            this._reject = rejectFn;
            this.start(geometryType);
        });
    }

    /**
     * Edits a GeoJSON geometry.
     *
     * Fires {@link DrawToolEventMap.start} event at start.
     *
     * @param geometry GeoJSON geometry or Drawing instance to edit.
     * If passing a {@link Drawing}, this tool takes full ownership
     * over it, and **will destroy** it when done.
     */
    edit(geometry: GeoJSON.Geometry | Drawing) {
        if (this._state !== DrawToolState.READY) {
            throw new Error('Cannot edit drawing: already drawing');
        }

        this._init(DrawToolMode.EDIT, null, geometry);

        this._state = DrawToolState.ACTIVE;
        this.dispatchEvent({ type: 'start' });
    }

    /**
     * Edits a GeoJSON geometry and returns a promise.
     *
     * Fires {@link DrawToolEventMap.start} event at start.
     *
     * @param geometry GeoJSON geometry or Drawing instance to edit.
     * If passing a {@link Drawing}, this tool takes full ownership
     * over it, and **will destroy** it when done.
     * @returns Promise resolving to the GeoJSON geometry drawn
     */
    editAsAPromise(geometry: GeoJSON.Geometry | Drawing): Promise<GeoJSON.Geometry> {
        return new Promise((resolveFn, rejectFn) => {
            this._resolve = resolveFn;
            this._reject = rejectFn;
            this.edit(geometry);
        });
    }

    /**
     * Pauses current drawing so click events are not captured.
     * This is useful when the user is currently interacting with the camera.
     */
    pause(): void {
        if (this._state !== DrawToolState.ACTIVE) return;

        this._cleanEventHandlers();

        this._state = DrawToolState.PAUSED;
        this._setState(DrawToolInternalState.NOOP);
    }

    /**
     * Continues a paused drawing.
     */
    continue(): void {
        if (this._state !== DrawToolState.PAUSED) return;

        this._createEventHandlers();
        this._state = DrawToolState.ACTIVE;
        this._restoreDefaultState();
    }

    /**
     * Ends the current drawing (active or paused).
     *
     * Fires {@link DrawToolEventMap.end} event.
     *
     * @returns GeoJSON geometry drawn
     */
    end(): GeoJSON.Geometry {
        if (this._state === DrawToolState.READY) return null;

        this._setState(DrawToolInternalState.NOOP);

        const geojson = this.toGeoJSON();
        this.dispatchEvent({ type: 'end', geojson });

        if (this._resolve) {
            this._resolve(geojson);
        }
        this._resolve = null;
        this._reject = null;
        this.reset();
        return geojson;
    }

    /**
     * Triggers end after the event loop has been processed.
     * When deferring ending, any click events on the canvas will be handled *before* ending.
     *
     * Let's take an example where the app:
     * - listens to the `end` event and creates a GeometryObject based on the geometry,
     * - listens to `click` events on the canvas to check for `GeometryObject` and edit them.
     *
     * Without deferring, the following would happen:
     * 1. `this.end()`, triggering `end` event
     * 2. `end` event is processed by app, creating the shape
     * 3. `click` event on canvas is processed by the app (because we're still processing
     * that event!)
     * 4. the app edits the newly created geometry 💩
     *
     * With deferring:
     * 1. `this.end()` is queued in event loop
     * 2. `click` event on canvas is processed by the app
     * 3. `this.end()` is called, triggering `end` event
     * 4. `end` event is processed by app, creating the shape
     */
    private _endAfterEventloop(): void {
        setTimeout(() => this.end(), 0);
    }

    /**
     * Aborts current drawing (active or paused).
     *
     * Fires {@link DrawToolEventMap.abort} event.
     */
    reset(): void {
        if (this._state === DrawToolState.READY) return;

        this._setState(DrawToolInternalState.NOOP);

        if (this._reject) {
            this._reject(PromiseUtils.abortError());
            this._resolve = null;
            this._reject = null;
        }
        this.dispatchEvent({ type: 'abort' });
        this._clean();
    }

    /**
     * Disposes of the object
     *
     */
    dispose(): void {
        this.reset();
    }

    /**
     * Gets the current GeoJSON corresponding to the shape being drawn.
     * In case of polygons, ensures the shape is closed.
     *
     * Returns `null` if the state is {@link DrawToolState.READY} or
     * if the shape is empty.
     *
     * @returns {object} GeoJSON object
     */
    toGeoJSON(): GeoJSON.Geometry {
        if (this._state === DrawToolState.READY) return null;
        if (this._coordinates.length === 0) return null;

        // Deep clone
        const coords = this._coordinates.map(c => [c[0], c[1], c[2]]);
        if (this._nextPointCoordinates !== null) {
            // Add next point into geometry
            if (this._geometryType === 'Polygon') {
                coords.splice(-1, 0, this._nextPointCoordinates);
            } else {
                coords.push(this._nextPointCoordinates);
            }
        }

        let coordinates;
        switch (this._geometryType) {
            case 'Point':
                coordinates = coords[0];
                break;
            case 'LineString':
            case 'MultiPoint':
                coordinates = coords;
                break;
            case 'Polygon':
            default:
                {
                    // Polygon is always closed
                    const outerRing = coords;
                    coordinates = [outerRing];
                }
                break;
        }
        const geojson = {
            type: this._geometryType,
            coordinates,
        } as GeoJSON.Geometry;
        return geojson;
    }

    /// PUBLIC MODIFIERS FUNCTIONS

    /**
     * Adds a new point at the end of the geometry.
     * If max point is reached, ends the drawing.
     *
     * Fires {@link DrawToolEventMap.add} event.
     * Fires {@link DrawToolEventMap.drawing} event.
     * Fires {@link DrawToolEventMap.end} event if `maxPoints` reached.
     *
     * @param coords Position of the new point
     */
    addPointAt(coords: Vector3): void {
        let index = this._coordinates.length;
        if (this._geometryType === 'Polygon') {
            if (this._coordinates.length === 0) {
                // Push initial coords twice to close the polygon
                this._coordinates.push([coords.x, coords.y, coords.z]);
                this._coordinates.push([coords.x, coords.y, coords.z]);
            } else {
                this._coordinates.splice(-1, 0, [coords.x, coords.y, coords.z]);
                index--;
            }
        } else {
            this._coordinates.push([coords.x, coords.y, coords.z]);
        }

        this._updateInteractionsCapabilities();
        this._updatePoints3D();
        this.update();

        this.dispatchEvent({
            type: 'add',
            at: coords,
            index,
        });
        this.dispatchEvent({ type: 'drawing' });

        if (this._coordinates.length >= this._realMaxPoints) {
            this._endAfterEventloop();
        }
    }

    /**
     * Updates position of a point.
     *
     * Fires {@link DrawToolEventMap.edit} event.
     * Fires {@link DrawToolEventMap.drawing} event.
     *
     * @param pointIdx Point index to update
     * @param coords New position of the point
     */
    updatePointAt(pointIdx: number, coords: Vector3): void {
        this._coordinates[pointIdx] = [coords.x, coords.y, coords.z];

        // Update rendering
        this._pointsGroup.children[pointIdx].visible = true;
        this._pointsGroup.children[pointIdx].position.copy(coords);
        this._pointsGroup.children[pointIdx].updateMatrixWorld();
        this._instance.notifyChange(this._pointsGroup.children[pointIdx]);

        if (this._geometryType === 'Polygon') {
            // We have a closed polygon, also update last one if we update the first and vice-versa
            if (pointIdx === 0) {
                // We have a closed polygon, also update last one
                const lastIndex = this._pointsGroup.children.length - 1;
                this._pointsGroup.children[lastIndex].visible = true;
                this._pointsGroup.children[lastIndex].position.copy(coords);
                this._pointsGroup.children[lastIndex].updateMatrixWorld();
                this._instance.notifyChange(this._pointsGroup.children[lastIndex]);

                this._coordinates[this._coordinates.length - 1] = [coords.x, coords.y, coords.z];
            } else if (pointIdx === this._coordinates.length - 1) {
                this._pointsGroup.children[0].visible = true;
                this._pointsGroup.children[0].position.copy(coords);
                this._pointsGroup.children[0].updateMatrixWorld();
                this._instance.notifyChange(this._pointsGroup.children[0]);

                this._coordinates[0] = [coords.x, coords.y, coords.z];
            }
        }

        this.update();

        // If dragging, don't dispatch EDIT event from here, wait until drag is stopped
        if (
            this._internalState !== DrawToolInternalState.DRAGGING
            && this._internalState !== DrawToolInternalState.DRAGGING_STARTED
        ) {
            // Calling this from API, dispatch EDIT event
            this._updateEdges();

            // Dispatch event
            this.dispatchEvent({
                type: 'edit',
                index: pointIdx,
                at: this._pointsGroup.children[pointIdx].position,
            });
        }
        this.dispatchEvent({ type: 'drawing' });
    }

    /**
     * Deletes a point.
     *
     * Fires {@link DrawToolEventMap.delete} event.
     * Fires {@link DrawToolEventMap.drawing} event.
     *
     * @param pointIdx Point index to delete
     */
    deletePoint(pointIdx: number): void {
        if (
            this._geometryType === 'Polygon'
            && (pointIdx === 0 || pointIdx === this._coordinates.length - 1)
        ) {
            // We have a closed polygon, delete first one and set last one to the "new" first
            this._coordinates.splice(0, 1);
            this._coordinates[this._coordinates.length - 1] = [
                this._coordinates[0][0],
                this._coordinates[0][1],
                this._coordinates[0][2],
            ];
        } else {
            this._coordinates.splice(pointIdx, 1);
        }

        this._updateInteractionsCapabilities();
        this._updatePoints3D();
        this.update();

        this.dispatchEvent({
            type: 'delete',
            index: pointIdx,
        });
        this.dispatchEvent({ type: 'drawing' });
    }

    /**
     * Inserts a new point at an index.
     * Note: it does *not* end the drawing if max point is reached.
     *
     * Fires {@link DrawToolEventMap.add} event.
     * Fires {@link DrawToolEventMap.drawing} event.
     *
     * @param pointIdx Point index
     * @param coords Position for the new point
     */
    insertPointAt(pointIdx: number, coords: Vector3): void {
        this._coordinates.splice(pointIdx, 0, [coords.x, coords.y, coords.z]);
        if (this._geometryType === 'Polygon' && pointIdx === 0) {
            this._coordinates[this._coordinates.length - 1] = [
                this._coordinates[0][0],
                this._coordinates[0][1],
                this._coordinates[0][2],
            ];
        }

        this._updateInteractionsCapabilities();
        this._updatePoints3D();
        this.update();

        this.dispatchEvent({ type: 'add', at: coords, index: pointIdx });
        this.dispatchEvent({ type: 'drawing' });
    }

    /// INTERNAL GENERIC METHODS

    /**
     * Initializes common stuff when starting drawing for both editing & creating.
     *
     * @param mode Mode to start
     * @param geometryType Geometry type to create
     * (if `null`, `geometry` must be provided)
     * @param geometry Geometry to edit
     */
    private _init(
        mode: DrawToolMode,
        geometryType?: DrawingGeometryType,
        geometry?: GeoJSON.Geometry | Drawing,
    ): void {
        this._mode = mode;

        this._coordinates = [];
        this._nextPoint3D = null;
        this._nextPointCoordinates = null;
        this._splicingPoint3D = null;
        this._splicingPointEdge = null;
        this._splicingPointCoordinates = null;
        this._draggedPointIndex = null;

        if (geometry) {
            if ('isDrawing' in geometry) {
                this._geometryType = geometry.geometryType;
                this._drawObject = geometry;
            } else {
                // GeoJSON
                this._geometryType = geometry.type as DrawingGeometryType;
                this._drawObject = new Drawing(
                    this._instance, this._drawObjectOptions, geometry,
                );
            }

            // Get initial coordinates from drawObject
            const nbPoints = this._drawObject.coordinates.length / 3;
            for (let i = 0; i < nbPoints; i += 1) {
                this._coordinates.push([
                    this._drawObject.coordinates[i * 3 + 0],
                    this._drawObject.coordinates[i * 3 + 1],
                    this._drawObject.coordinates[i * 3 + 2],
                ]);
            }
        } else {
            this._geometryType = geometryType;
            this._drawObject = new Drawing(this._instance, this._drawObjectOptions);
        }

        if (this._geometryType === 'Point' || this._geometryType === 'MultiPoint'
        ) {
            // Actually by-pass completely the drawobject, as we do
            // all rendering in this tool
            this._drawObject.clear();
            this._drawObject.removeFromParent();
        } else {
            this._instance.threeObjects.add(this._drawObject);
        }

        switch (this._geometryType) {
            case 'Point':
            case 'MultiPoint':
                this._realMinPoints = this._minPoints ?? 1;
                this._realMaxPoints = this._maxPoints ?? Infinity;
                break;
            case 'LineString':
                this._realMinPoints = this._minPoints ?? 2;
                this._realMaxPoints = this._maxPoints ?? Infinity;
                break;
            case 'Polygon':
                this._realMinPoints = (
                    this._minPoints !== null && this._minPoints !== undefined
                        ? Math.max(this._minPoints + 1, 4)
                        : 4
                );
                this._realMaxPoints = (
                    this._maxPoints !== null && this._maxPoints !== undefined
                        ? this._maxPoints + 1
                        : Infinity
                );
                break;
            default:
                // do nothing
        }

        this._updateInteractionsCapabilities();
        this._restoreDefaultState();

        this._pointsGroup = new Group();
        this._pointsGroup.name = 'drawtool-points';
        this._instance.threeObjects.add(this._pointsGroup);

        // Used for raycasting against the edges
        // (raycasting against the lines don't always work depending on the camera angle)
        this._edges = new Group();
        this._edges.name = 'drawtool-edges';
        this._instance.threeObjects.add(this._edges);

        this._updatePoints3D();
        this._createEventHandlers();
    }

    /**
     * Updates rendering
     */
    update(): void {
        if (this._state === DrawToolState.READY) return;
        this._drawObject.setGeojson(this.toGeoJSON());
    }

    /**
     * Cleans state so we can safely call start/edit again on this object.
     */
    private _clean(): void {
        this._removeDrawings();
        this._cleanEventHandlers();
        this._state = DrawToolState.READY;
        this._internalState = DrawToolInternalState.NOOP;
        this._mode = null;
        this._coordinates = null;
    }

    /**
     * Removes drawings: drawn shape & labels
     */
    private _removeDrawings(): void {
        if (this._drawObject) {
            this._drawObject.removeFromParent();
            this._drawObject.dispose();
            this._drawObject = null;
            this._instance.notifyChange(this._instance.threeObjects);
        }

        if (this._pointsGroup) {
            for (const o of this._pointsGroup.children) {
                (o as CSS2DObject).element.remove();
            }
            this._pointsGroup.clear();
            this._pointsGroup.removeFromParent();
            this._pointsGroup = null;
            this._instance.notifyChange(this._instance.threeObjects);
        }

        if (this._nextPoint3D) {
            this._nextPoint3D.element.remove();
            this._nextPoint3D.removeFromParent();
            this._nextPoint3D = null;
            this._instance.notifyChange(this._instance.threeObjects);
        }

        if (this._splicingPoint3D) {
            this._splicingPoint3D.element.remove();
            this._splicingPoint3D.removeFromParent();
            this._splicingPoint3D = null;
            this._instance.notifyChange(this._instance.threeObjects);
        }

        if (this._edges) {
            this._edges.clear();
            this._edges.removeFromParent();
            this._edges = null;
            this._instance.notifyChange(this._instance.threeObjects);
        }
    }

    /// STATE

    /**
     * Updates canSplice & canAddNewPoint based on mode, geometry and number of points.
     */
    private _updateInteractionsCapabilities(): void {
        this._canSplice = (
            this._enableSplicing
            && this._coordinates.length < this._realMaxPoints
            && (this._geometryType === 'LineString' || this._geometryType === 'Polygon')
        );

        switch (this._mode) {
            case DrawToolMode.CREATE:
                this._canAddNewPoint = this._coordinates.length < this._realMaxPoints;
                break;
            case DrawToolMode.EDIT:
                this._canAddNewPoint = (
                    this._enableAddPointsOnEdit
                    && this._coordinates.length < this._realMaxPoints
                    && (this._geometryType === 'LineString' || this._geometryType === 'MultiPoint')
                );
                break;
            default:
                // do nothing
        }
    }

    /**
     * Restores default state depending on mode & geometry
     */
    private _restoreDefaultState(): void {
        this._setState(
            this._canAddNewPoint
                ? DrawToolInternalState.NEW_POINT
                : DrawToolInternalState.NOOP,
        );
    }

    /**
     * Pushes a new temporary state
     *
     * @param state State
     */
    private _pushState(state: DrawToolInternalState): void {
        this._oldState = this._internalState;
        this._setState(state);
    }

    /**
     * Restores from a temporary state.
     * If the state has changed since `_pushState`, will be ignored.
     *
     * @param state State
     */
    private _popState(state: DrawToolInternalState): void {
        if (state === this._internalState) {
            this._setState(this._oldState);
        }
    }

    /**
     * Updates internal state and handles display of points and their events
     *
     * @param state New state
     */
    private _setState(state: DrawToolInternalState): void {
        if (this._internalState === state) return;

        // Do stuff based on previous state
        // (we know the new one is different from the old one)
        switch (this._internalState) {
            case DrawToolInternalState.OVER_EDGE:
                this._hideSplicingPoint();
                this._instance.viewport.style.cursor = 'auto';
                break;
            case DrawToolInternalState.NEW_POINT:
                this._hideNextPoint();
                break;
            case DrawToolInternalState.DRAGGING_STARTED:
            case DrawToolInternalState.DRAGGING:
                if (
                    state === DrawToolInternalState.NOOP
                    || state === DrawToolInternalState.NEW_POINT
                ) {
                    this._setPointerEventsEnabled(true);
                }
                break;
            default:
                // do nothing
        }

        // Do stuff based on new state
        switch (state) {
            case DrawToolInternalState.DRAGGING_STARTED:
                // Disable pointerEvents on all points
                // to make moving smooth
                this._setPointerEventsEnabled(false);
                break;
            case DrawToolInternalState.OVER_EDGE:
                this._instance.viewport.style.cursor = 'pointer';
                break;
            default:
                // do nothing
        }

        this._internalState = state;
    }

    /// EVENTS

    /**
     * Creates event handlers for the interactions.
     * This is used when starting or resuming drawing.
     */
    private _createEventHandlers(): void {
        if (this._state === DrawToolState.ACTIVE) return;

        this._eventHandlers = {
            mousedown: this._onMouseDown.bind(this),
            mouseup: this._onMouseUp.bind(this),
            mousemove: this._onMouseMove.bind(this),
            contextmenu: evt => evt.preventDefault(), // In case controls do not already do this
        };

        // Use mouseup event to correctly trigger when right-click is *released* (and not pressed)
        // (so we can use controls with right-click)
        this._instance.viewport.addEventListener('mousedown', this._eventHandlers.mousedown);
        this._instance.viewport.addEventListener('mouseup', this._eventHandlers.mouseup);
        this._instance.viewport.addEventListener('mousemove', this._eventHandlers.mousemove);
        this._instance.viewport.addEventListener('contextmenu', this._eventHandlers.contextmenu);
    }

    /**
     * Removes event handlers
     * This is used when pausing or ending drawing.
     */
    private _cleanEventHandlers(): void {
        if (this._state !== DrawToolState.ACTIVE) return;

        if (this._instance && this._eventHandlers) {
            this._instance.viewport.removeEventListener('mousedown', this._eventHandlers.mousedown);
            this._instance.viewport.removeEventListener('mouseup', this._eventHandlers.mouseup);
            this._instance.viewport.removeEventListener('mousemove', this._eventHandlers.mousemove);
            this._instance.viewport.removeEventListener('contextmenu', this._eventHandlers.contextmenu);
            this._eventHandlers = null;
        }
    }

    /**
     * Generic mousedown handler
     *
     * @param evt Mouse event
     */
    private _onMouseDown(evt: MouseEvent): void {
        let res = false;
        if (evt.button === 0) {
            if (this._enableDragging && this._internalState === DrawToolInternalState.OVER_EDGE) {
                // Point displayed is on edge, but because of hit tolerance the cursor
                // might not be over the displayed point, so also handle event here
                this._spliceAndStartDrag();
                res = true;
            }
        }

        // If we have done something with that event, capture it
        if (res) evt.stopPropagation();
    }

    /**
     * Generic mouseup handler
     *
     * @param evt Mouse event
     */
    private _onMouseUp(evt: MouseEvent): void {
        let res = false;
        if (evt.button === 0) {
            // First, check if we are clicking on the first point of a polygon
            // to close the shape
            if (this._internalState === DrawToolInternalState.DRAGGING_STARTED) {
                if (this._enableDragging
                    && this._mode === DrawToolMode.CREATE
                    && this._geometryType === 'Polygon'
                    && this._draggedPointIndex === 0
                ) {
                    // Abort dragging - bypass states to avoid creating a new point
                    this._draggedPointIndex = null;
                    // FIXME: this is a hard assumption on the controls API!
                    (this._instance.controls as any).enabled = true;

                    this._endAfterEventloop();
                    res = true;
                }
            }

            if (
                !res
                && !this._enableDragging
                && this._internalState === DrawToolInternalState.OVER_EDGE
            ) {
                // Point displayed is on edge, but because of hit tolerance the cursor
                // might not be over the displayed point, so also handle event here
                this._spliceAndStartDrag();
                res = true;
            }

            // Then, check other interactions:
            if (!res && (
                this._internalState === DrawToolInternalState.DRAGGING
                || this._internalState === DrawToolInternalState.DRAGGING_STARTED
            )) {
                // Were we dragging a point?
                res = this._endDraggingPoint();
            } else if (this._internalState === DrawToolInternalState.NEW_POINT) {
                // Were we clicking for a new point?
                res = this._tryAddNewPoint(evt);
            }
            // Do nothing with that event
        } else if (evt.button === 2 && this._endDrawingOnRightClick) {
            res = this._tryEndDraw(evt);
        }

        // If we have done something with that event, capture it
        if (res) evt.stopPropagation();
    }

    /**
     * Generic mousemove handler
     *
     * @param evt Mouse event
     */
    private _onMouseMove(evt: MouseEvent): void {
        let res = false;

        if (
            this._internalState === DrawToolInternalState.DRAGGING_STARTED
            || this._internalState === DrawToolInternalState.DRAGGING
        ) {
            // A point is being dragged, move it
            res = this._tryMovePoint(evt);
        } else if (this._internalState === DrawToolInternalState.OVER_POINT) {
            // we're hovering a point, do nothing
        } else {
            if (this._canSplice) {
                // Are we close to an edge for splicing?
                res = this._tryShowSplicePoint(evt);
                if (res) {
                    // We found a point
                    this._setState(DrawToolInternalState.OVER_EDGE);
                } else if (this._internalState === DrawToolInternalState.OVER_EDGE) {
                    // No point anymore, restore
                    this._restoreDefaultState();
                }
            }

            if (!res
                && this._canAddNewPoint
                && this._internalState === DrawToolInternalState.NEW_POINT
            ) {
                // Display next point
                res = this._tryShowNextPoint(evt);
            }
        }

        // If we have done something with that event, capture it
        if (res) evt.stopPropagation();
    }

    /**
     * Tries to add a new point at the cursor, at the end of the geometry
     *
     * @param evt Mouse event
     * @returns `true` if a point is added, or `false` if no point available
     * under the mouse
     */
    private _tryAddNewPoint(evt: MouseEvent): boolean {
        if (this._internalState !== DrawToolInternalState.NEW_POINT) {
            console.warn('_tryAddNewPoint with unexpected state', this._internalState);
            return false;
        }

        const picked = this._getPointAt(evt);
        // did we *really* click on something
        if (!picked || !picked.picked) {
            return false;
        }
        this.addPointAt(picked.point);
        return true;
    }

    /**
     * Tries to end the drawing
     *
     * @param evt Mouse event
     * @returns `true` if the drawing was ended, or `false` otherwise (e.g. not enough
     * points for polygon)
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _tryEndDraw(evt: MouseEvent): boolean {
        // have we picked up enough point?
        if (this._coordinates.length < this._realMinPoints) return false;
        this._endAfterEventloop();
        return true;
    }

    /**
     * Tries to show the next point at the cursor
     *
     * @param evt Mouse event
     * @returns `true` if there is a point, or `false` otherwise
     */
    private _tryShowNextPoint(evt: MouseEvent): boolean {
        if (this._internalState !== DrawToolInternalState.NEW_POINT) {
            console.warn('_tryShowNextPoint with unexpected state', this._internalState);
            return false;
        }

        const picked = this._getPointAt(evt);
        if (!picked || !picked.picked) {
            // If we don't have a "real" point picked, hide the label following the cursor
            this._hideNextPoint();
            return false;
        }

        this._updateNextPoint(picked.point);
        return true;
    }

    /**
     * Tries to show a point for splicing an edge
     *
     * @param evt Mouse event
     * @returns `true` if there is a point, or `false` otherwise
     */
    private _tryShowSplicePoint(evt: MouseEvent): boolean {
        if (
            this._internalState !== DrawToolInternalState.NOOP
            && this._internalState !== DrawToolInternalState.NEW_POINT
            && this._internalState !== DrawToolInternalState.OVER_EDGE
        ) {
            console.warn('_tryShowSplicePoint with unexpected state', this._internalState);
            return false;
        }

        const mouse = this._instance.eventToCanvasCoords(evt, tmpVec2);
        const pointer = this._instance.canvasToNormalizedCoords(mouse, tmpVec2);
        raycaster.setFromCamera(pointer, this._instance.camera.camera3D);
        const picked = raycaster.intersectObject(this._edges, true);

        if (picked.length === 0) {
            return false;
        }

        const pickedEdge = picked[0].object as Edge;

        pickedEdge.line.closestPointToPoint(picked[0].point, true, tmpVec3);
        this._updateSplicingPoint(pickedEdge.edgeIndex, tmpVec3);
        return true;
    }

    /**
     * Tries to move a selected point
     *
     * @param evt Mouse event
     * @returns `true` if a point is updated, `false` otherwise
     */
    private _tryMovePoint(evt: MouseEvent): boolean {
        if (
            this._internalState !== DrawToolInternalState.DRAGGING_STARTED
            && this._internalState !== DrawToolInternalState.DRAGGING
        ) {
            console.warn('_tryMovePoint with unexpected state', this._internalState);
            return false;
        }

        const picked = this._getPointAt(evt);
        if (!picked || !picked.picked) {
            // If we don't have a "real" point picked, just ignore the new position
            // so it doesn't go in the limbo
            return false;
        }

        this._setState(DrawToolInternalState.DRAGGING);
        this.updatePointAt(this._draggedPointIndex, picked.point);
        return true;
    }

    /// RENDERING

    /**
     * Updates rendering of 3D points.
     * This is useful if we change the number of points, so we keep a simple logic for managing
     * ordering & event handlers.
     *
     * Instead of having to deal with reordering all the other points & deal with
     * event handlers, let's clean & recreate everything. As long as we don't have
     * 10000 points in our geometry, we should be OK.
     */
    private _updatePoints3D(): void {
        // First clean the existing 2D & 3D points
        for (const o of this._pointsGroup.children) {
            (o as CSS2DObject).element.remove();
        }
        this._pointsGroup.clear();

        // Create new ones
        const nbPoints = this._coordinates.length;

        for (let i = 0; i < nbPoints; i += 1) {
            const pt = this._point2DFactory(`${i + 1}`);
            pt.style.pointerEvents = 'auto';
            pt.style.cursor = 'pointer';
            const pt3d = new CSS2DObject(pt);
            pt3d.renderOrder = 1;
            pt3d.position.set(
                this._coordinates[i][0], this._coordinates[i][1], this._coordinates[i][2],
            );
            pt3d.updateMatrixWorld();
            this._pointsGroup.add(pt3d);

            // if drag-and-drop: mouseup event is handled in generic _onMouseUp
            // if on click: we bind to click to not interfer with general mouseup
            pt.addEventListener(this._enableDragging ? 'mousedown' : 'click', evt => {
                if (evt.button === 0) {
                    this._startDraggingPoint(i);
                    evt.stopPropagation();
                }
            });

            // Hide the next point & splicing point if we're close to a point
            pt.addEventListener('mouseover', () => this._pushState(DrawToolInternalState.OVER_POINT));
            pt.addEventListener('mouseout', () => this._popState(DrawToolInternalState.OVER_POINT));

            if (this._canAddNewPoint) {
                // We *should* always bind click event on pt if polygon and pt is the first point
                // to close the shape, but it does not work with drag and drop (event is swallowed
                // by drag and drop, so it's (also) handled in _onMouseUp
                if (!this._enableDragging && this._geometryType === 'Polygon' && i === 0) {
                    pt.addEventListener('click', evt => {
                        this._endAfterEventloop();
                        evt.stopPropagation();
                    });
                }
            }
        }

        if (this._canAddNewPoint) {
            const nextPointNumber = (
                this._geometryType === 'Polygon' && nbPoints > 0
                    ? nbPoints
                    : nbPoints + 1
            );
            if (this._nextPoint3D) {
                this._nextPoint3D.element.innerText = `${nextPointNumber}`;
            } else {
                const nextPoint2D = this._point2DFactory(`${nextPointNumber}`);
                this._nextPoint3D = new CSS2DObject(nextPoint2D);
                this._nextPoint3D.name = 'next-point';
                this._instance.threeObjects.add(this._nextPoint3D);
            }
        }

        this._updateEdges();
    }

    /**
     * Updates edges for splicing.
     */
    private _updateEdges(): void {
        const nbPoints = this._coordinates.length;
        const edgeSize = (
            // this.splicingHitTolerance can be null for auto
            // this.drawObject.extrudeDepth can be undefined if we just started drawing a line
            this._splicingHitTolerance ?? Math.max((this._drawObject.extrudeDepth ?? 10) * 1.5, 15)
        );

        this._edges.clear();

        for (let i = 1; i < nbPoints; i += 1) {
            // We need to use new Vector3s to pass them to Line object
            const start = new Vector3(
                this._coordinates[i - 1][0],
                this._coordinates[i - 1][1],
                this._coordinates[i - 1][2],
            );
            const end = new Vector3(
                this._coordinates[i][0], this._coordinates[i][1], this._coordinates[i][2],
            );

            // Find orientation of the edge
            tmpVec3.subVectors(end, start).normalize();
            tmpQuat.setFromUnitVectors(unitVector, tmpVec3);

            // Find length of the edge
            const width = start.distanceTo(end);

            // Middle of edge
            tmpVec3.addVectors(start, end).divideScalar(2);

            // Create our object and position it
            const boxGeom = new BoxGeometry(width, edgeSize, edgeSize);
            const edge = new Edge(boxGeom, emptyMaterial);
            edge.setRotationFromQuaternion(tmpQuat);
            edge.position.copy(tmpVec3);
            edge.visible = false;
            edge.updateMatrix();
            edge.updateMatrixWorld(true);

            // Add metadata for picking
            edge.edgeIndex = i - 1;
            edge.line = new Line3(start, end);
            this._edges.add(edge);
        }
        this._instance.notifyChange(this._edges);
    }

    /// INTERACTIONS

    /**
     * Splices at the current position and starts dragging the new point
     */
    private _spliceAndStartDrag(): void {
        const idx = this._splicingPointEdge + 1;
        this.insertPointAt(idx, this._splicingPointCoordinates);
        this._hideSplicingPoint();
        this._startDraggingPoint(idx);
    }

    /**
     * Sets up stuff required for dragging a point.
     * Could be on mousedown (if `enableDragging`) or click (if `!enableDragging`)!
     *
     * @param idx Index of the point
     */
    private _startDraggingPoint(idx: number): void {
        if (this._enableDragging) {
            // Make sure controls are disabled while we are dragging
            // FIXME: this is a hard assumption on the controls API!
            (this._instance.controls as any).enabled = false;
        }

        this._setState(DrawToolInternalState.DRAGGING_STARTED);
        this._draggedPointIndex = idx;
    }

    /**
     * Sends `edit` event and cleans up stuff required after dragging a point.
     *
     * @returns `true` if point was really dragged or `false` if it was a noop.
     */
    private _endDraggingPoint(): boolean {
        this._updateEdges();
        const hasChanged = this._internalState === DrawToolInternalState.DRAGGING;

        if (hasChanged) {
            // Dispatch event
            this.dispatchEvent({
                type: 'edit',
                index: this._draggedPointIndex,
                at: this._pointsGroup.children[this._draggedPointIndex].position,
            });
            this.dispatchEvent({ type: 'drawing' });
        }

        // Clean-up
        this._draggedPointIndex = null;
        if (this._enableDragging) {
            // FIXME: this is a hard assumption on the controls API!
            (this._instance.controls as any).enabled = true;
        }

        this._restoreDefaultState();

        return hasChanged;
    }

    /**
     * Displays the next point to add
     *
     * @param coords Position
     */
    private _updateNextPoint(coords: Vector3): void {
        if (
            this._internalState !== DrawToolInternalState.NEW_POINT
            && this._internalState !== DrawToolInternalState.OVER_EDGE
        ) {
            console.warn('_updateNextPoint with unexpected state', this._internalState);
            return;
        }

        this._nextPoint3D.visible = true;
        this._nextPoint3D.position.copy(coords);
        this._nextPoint3D.updateMatrixWorld();
        this._instance.notifyChange(this._nextPoint3D);

        // update the last position
        this._nextPointCoordinates = [coords.x, coords.y, coords.z];
        this.update();
        this.dispatchEvent({ type: 'drawing' });
    }

    /**
     * Hides the next point, so it's simply not visible
     */
    private _hideNextPoint(): void {
        if (this._nextPoint3D) {
            this._nextPoint3D.visible = false;
            this._nextPointCoordinates = null;
            this._instance.notifyChange(this._nextPoint3D);
            this.update();
            this.dispatchEvent({ type: 'drawing' });
        }
    }

    /**
     * Display a point for splicing along an edge
     *
     * @param edgeIndex Edge index
     * @param coords Position of the point
     */
    private _updateSplicingPoint(edgeIndex: number, coords: Vector3): void {
        if (
            this._internalState !== DrawToolInternalState.NOOP
            && this._internalState !== DrawToolInternalState.NEW_POINT
            && this._internalState !== DrawToolInternalState.OVER_EDGE
        ) {
            console.warn('_updateSplicingPoint with unexpected state', this._internalState);
            return;
        }

        this._splicingPointCoordinates = coords.clone();
        this._splicingPointEdge = edgeIndex;

        if (this._splicingPoint3D === null) {
            const pt = this._point2DFactory(' ');
            pt.style.pointerEvents = 'auto';
            pt.style.cursor = 'pointer';
            this._splicingPoint3D = new CSS2DObject(pt);
            this._instance.threeObjects.add(this._splicingPoint3D);
            this._instance.notifyChange(this._instance.threeObjects);

            // if drag-and-drop: mouseup event is handled in generic _onMouseUp
            // if on click: we bind to click to not interfer with general mouseup
            this._splicingPoint3D.element.addEventListener(this._enableDragging ? 'mousedown' : 'click', evt => {
                if (evt.button === 0) {
                    this._spliceAndStartDrag();
                    evt.stopPropagation();
                }
            });
        }

        this._splicingPoint3D.visible = true;

        // Make sure splicing point is always *behind* any node point
        this._splicingPoint3D.renderOrder = -1;
        this._splicingPoint3D.position.copy(coords);
        this._splicingPoint3D.updateMatrixWorld();

        this._instance.notifyChange(this._splicingPoint3D);
    }

    /**
     * Removes the point for splicing (if exists)
     */
    private _hideSplicingPoint(): void {
        if (this._splicingPoint3D) {
            this._splicingPoint3D.visible = false;
            this._splicingPointCoordinates = null;
            this._splicingPointEdge = null;
            this._instance.notifyChange(this._splicingPoint3D);
        }
    }

    /**
     * Enables or disables pointer events for all CSS2D points.
     * This is useful to disable for performance while dragging for instance.
     *
     * @param enable Enable or disable
     */
    private _setPointerEventsEnabled(enable: boolean): void {
        for (const o of this._pointsGroup.children) {
            const style = (o as CSS2DObject).element.style;
            style.pointerEvents = enable ? 'auto' : 'none';
            style.cursor = enable ? 'pointer' : 'auto';
        }
    }
}

export default DrawTool;
