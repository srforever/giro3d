/**
 * @module interactions/DrawTool
 */
import {
    BoxGeometry,
    EventDispatcher,
    Group,
    Line3,
    Mesh,
    MeshBasicMaterial,
    Quaternion,
    Raycaster,
    Vector3,
} from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import Instance from '../core/Instance.js';
import Drawing from './Drawing.js';

/**
 * Types of geometries to draw
 *
 * @enum {string}
 * @namespace GEOMETRY_TYPE
 * @readonly
 * @api
 */
export const GEOMETRY_TYPE = {
    /**
     * Draw one point
     *
     * @api
     */
    POINT: 'Point',
    /**
     * Draw several points
     *
     * @api
     */
    MULTIPOINT: 'MultiPoint',
    /**
     * Draw a line
     *
     * @api
     */
    LINE: 'LineString',
    /**
     * Draw a polygon
     *
     * @api
     */
    POLYGON: 'Polygon',
};

/**
 * The names of events supported by
 * [`DrawTool.addEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.addEventListener)
 * and
 * [`DrawTool.removeEventListener()`](https://threejs.org/docs/#api/en/core/EventDispatcher.removeEventListener)
 *
 * @enum {string}
 * @namespace DRAWTOOL_EVENT_TYPE
 * @readonly
 * @api
 */
export const DRAWTOOL_EVENT_TYPE = {
    /**
     * Fires when the tool becomes active
     *
     * @api
     */
    START: 'start',
    /**
     * Fires when the shape is being edited (including mouse move)
     *
     * @api
     */
    DRAWING: 'drawing',
    /**
     * Fires when a point has been added
     *
     * @api
     * @property {Vector3} at Coordinates
     * @property {number} index Index of the point added
     */
    ADD: 'add',
    /**
     * Fires when a point has been edited
     *
     * @api
     * @property {Vector3} at Coordinates
     * @property {number} index Index of the point edited
     */
    EDIT: 'edit',
    /**
     * Fires when a point has been deleted
     *
     * @api
     * @property {number} index Index of the point deleted
     */
    DELETE: 'delete',
    /**
     * Fires when the drawing has ended
     *
     * @api
     * @property {object} geojson GeoJSON object representing the geometry drawn
     */
    END: 'end',
    /**
     * Fires when the drawing has been aborted
     *
     * @api
     */
    ABORT: 'abort',
};

/**
 * State of the `DrawTool`
 *
 * @enum {string}
 * @namespace DRAWTOOL_STATE
 * @api
 */
export const DRAWTOOL_STATE = {
    /**
     * Initialized but inactive. Call
     * {@link module:interactions/DrawTool~DrawTool#start DrawTool.start()}
     * or {@link module:interactions/DrawTool~DrawTool#edit DrawTool.edit()} to begin.
     *
     * @api
     */
    READY: 'ready',
    /**
     * A drawing is being performed. You can call:
     * - {@link module:interactions/DrawTool~DrawTool#end DrawTool.end()} to end,
     * - {@link module:interactions/DrawTool~DrawTool#reset DrawTool.reset()} to abort,
     * - {@link module:interactions/DrawTool~DrawTool#pause DrawTool.pause()} to pause
     * (during camera move for instance).
     *
     * @api
     */
    ACTIVE: 'active',
    /**
     * A drawing is being performed but paused (no events handled). You can call:
     * - {@link module:interactions/DrawTool~DrawTool#end DrawTool.end()} to end,
     * - {@link module:interactions/DrawTool~DrawTool#reset DrawTool.reset()} to abort,
     * - {@link module:interactions/DrawTool~DrawTool#continue DrawTool.continue()} to continue.
     *
     * @api
     */
    PAUSED: 'paused',
};

/**
 * Internal state for the tool
 *
 * @enum {string}
 */
const INTERNAL_STATE = {
    /** Nothing to do */
    NOOP: 'noop',
    /** Started dragging, but not moved yet */
    DRAGGING_STARTED: 'dragging_started',
    /** Dragging and moved */
    DRAGGING: 'dragging',
    /** Ready to add a new point */
    NEW_POINT: 'new_point',
    /** Hovering a point (for dragging) */
    OVER_POINT: 'over_point',
    /** Hovering an edge (for splicing) */
    OVER_EDGE: 'over_edge',
};

/**
 * Edition mode for the `DrawTool`
 *
 * @enum {string}
 * @namespace DRAWTOOL_MODE
 * @api
 */
export const DRAWTOOL_MODE = {
    /**
     * Creating a new shape
     *
     * @api
     */
    CREATE: 'create',
    /**
     * Editing a shape
     *
     * @api
     */
    EDIT: 'edit',
};

const raycaster = new Raycaster();
const tmpCoords = new Vector3();

const emptyMaterial = new MeshBasicMaterial();
const tmpQuat = new Quaternion();
const unitVector = new Vector3(1, 0, 0);
const tmpVec3 = new Vector3();

/**
 * @callback getPointAt
 * @description
 * Method to get the X,Y,Z coordinates corresponding to where the user clicked.
 *
 * Must return:
 * - if a point is found, an object with the following properties:
 *   - `point`: `Vector3`
 *   - `picked`: `boolean`, `true` if correspond to real data, `false` if interpolated
 * - if no point is found, `null`
 * @param {MouseEvent} evt Mouse event
 * @returns {?object} object
 * @api
 */

/**
 * @callback point2DFactory
 * @description
 * Method to create a HTML element for points for CSS2DObject
 * @param {string} text Text to display
 * @returns {HTMLElement} HTML Element
 * @api
 */

/**
 * Enables the user to draw on the map.
 *
 *     // example of Giro3D instantiation
 *     const instance = new Instance(viewerDiv, options)
 *     const map = new Map('myMap', { extent });
 *     instance.add(map);
 *
 *     // Add our tool
 *     const drawTool = new DrawTool(instance);
 *
 *     // Start and wait for result
 *     drawTool.startAsAPromise()
 *        .then((polygon) => {
 *            // Use generated polygon as GeoJSON
 *        })
 *     // Or use events
 *     drawTool.addEventListener(DRAWTOOL_EVENT_TYPE.END, (polygon) => {
 *         // Use generated polygon as GeoJSON
 *     })
 *     drawTool.start();
 *
 * @property {DRAWTOOL_STATE} state Current state
 * @property {?DRAWTOOL_MODE} mode Current mode
 * @property {?Drawing} drawObject Current object being drawn
 * @api
 */
class DrawTool extends EventDispatcher {
    /**
     * Constructs a DrawTool
     *
     * @param {Instance} instance Giro3D instance
     * @param {object} [options] Optional properties
     * @param {?number} [options.maxPoints=Infinity] The number of points that can be drawn
     * before a polygon or line is finished
     * @param {?number} [options.minPoints=2|3] The number of points that must be drawn before
     * a polygon or line can be finished
     * @param {?module:interactions/DrawTool~getPointAt} options.getPointAt Callback to get
     * the point from where the user clicked
     * @param {?module:interactions/DrawTool~point2DFactory} options.point2DFactory Callback
     * for creating DOM element for points for CSS2DObject
     * @param {?object} options.drawObjectOptions Options for creating GeometryObject (see
     * {@link module:interactions/Drawing~Drawing Drawing} for
     * available options)
     * @param {?boolean} [options.endDrawingOnRightClick=true] Capture right-click to end the
     * drawing
     * @param {?boolean} [options.enableSplicing=true] Enables splicing edges
     * @param {?number} [options.splicingHitTolerance=null] Hit tolerance for splicing
     * (`null` for auto)
     * @param {?boolean} [options.enableAddPointsOnEdit=true] Enables adding points for
     * line/multipoint geometries when editing
     * @param {?boolean} [options.enableDragging=true] Edit points via drag-and-drop (otherwise,
     * moving a point is on click)
     * @api
     */
    constructor(instance, options = {}) {
        super();
        this.instance = instance;
        this.setOptions(options);

        this.drawObject = null;
        this.pointsGroup = null;
        this.state = DRAWTOOL_STATE.READY;
        this.mode = null;
    }

    /**
     * Utility function to set options.
     *
     * @param {object} [options] See constructor
     * @api
     */
    setOptions(options) {
        this.maxPoints = options.maxPoints ?? Infinity;
        this.minPoints = options.minPoints ?? null;
        this.getPointAt = options.getPointAt ?? this._defaultPickPointAt.bind(this);
        this.point2DFactory = options.point2DFactory ?? this._defaultPoint2DFactory.bind(this);
        this.drawObjectOptions = options.drawObjectOptions ?? {};
        this.endDrawingOnRightClick = options.endDrawingOnRightClick ?? true;
        this.enableSplicing = options.enableSplicing ?? true;
        this.splicingHitTolerance = options.splicingHitTolerance ?? null;
        this.enableDragging = options.enableDragging ?? true;
        this.enableAddPointsOnEdit = options.enableAddPointsOnEdit ?? true;
    }

    /// DEFAULT CALLBACKS

    /**
     * Default picking callback.
     *
     * @param {MouseEvent} evt Mouse event
     * @returns {object} Object
     */
    _defaultPickPointAt(evt) {
        const picked = this.instance.pickObjectsAt(evt, {
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
     * @param {string} text Label to display
     * @returns {HTMLElement} DOM Element to attach to the CSS2DObject
     */
    // eslint-disable-next-line class-methods-use-this
    _defaultPoint2DFactory(text) {
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
     * Starts a new drawing
     *
     * @param {GEOMETRY_TYPE} geometryType Geometry type to draw
     * @fires DRAWTOOL_EVENT_TYPE#START At start
     * @api
     */
    start(geometryType = GEOMETRY_TYPE.POLYGON) {
        if (this.state !== DRAWTOOL_STATE.READY) {
            throw new Error('Cannot start drawing: already drawing');
        }

        this._init(DRAWTOOL_MODE.CREATE, geometryType, null);

        this.state = DRAWTOOL_STATE.ACTIVE;
        this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.START });
    }

    /**
     * Starts a new drawing and returns a promise
     *
     * @param {GEOMETRY_TYPE} geometryType Geometry type to draw
     * @returns {Promise<object>} Promise resolving to the GeoJSON geometry drawn
     * @fires DRAWTOOL_EVENT_TYPE#START At start
     * @api
     */
    startAsAPromise(geometryType = GEOMETRY_TYPE.POLYGON) {
        return new Promise((resolveFn, rejectFn) => {
            this.resolve = resolveFn;
            this.reject = rejectFn;
            this.start(geometryType);
        });
    }

    /**
     * Edits a GeoJSON geometry
     *
     * @param {object|Drawing} geometry GeoJSON geometry or Drawing instance to edit.
     * If passing a {@link module:interactions/Drawing~Drawing Drawing},
     * this tool takes full ownership over it, and **will destroy** it when done.
     * @fires DRAWTOOL_EVENT_TYPE#START At start
     * @api
     */
    edit(geometry) {
        if (this.state !== DRAWTOOL_STATE.READY) {
            throw new Error('Cannot edit drawing: already drawing');
        }

        this._init(DRAWTOOL_MODE.EDIT, null, geometry);

        this.state = DRAWTOOL_STATE.ACTIVE;
        this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.START });
    }

    /**
     * Edits a GeoJSON geometry and returns a promise
     *
     * @param {object|Drawing} geometry GeoJSON geometry or Drawing instance to edit.
     * If passing a {@link module:interactions/Drawing~Drawing Drawing},
     * this tool takes full ownership over it, and **will destroy** it when done.
     * @returns {Promise<object>} Promise resolving to the GeoJSON geometry drawn
     * @fires DRAWTOOL_EVENT_TYPE#START At start
     * @api
     */
    editAsAPromise(geometry) {
        return new Promise((resolveFn, rejectFn) => {
            this.resolve = resolveFn;
            this.reject = rejectFn;
            this.edit(geometry);
        });
    }

    /**
     * Pauses current drawing so click events are not captured.
     * This is useful when the user is currently interacting with the camera.
     *
     * @api
     */
    pause() {
        if (this.state !== DRAWTOOL_STATE.ACTIVE) return;

        this._cleanEventHandlers();

        this.state = DRAWTOOL_STATE.PAUSED;
        this._setState(INTERNAL_STATE.NOOP);
    }

    /**
     * Continues a paused drawing.
     *
     * @api
     */
    continue() {
        if (this.state !== DRAWTOOL_STATE.PAUSED) return;

        this._createEventHandlers();
        this.state = DRAWTOOL_STATE.ACTIVE;
        this._restoreDefaultState();
    }

    /**
     * Ends the current drawing (active or paused).
     *
     * @returns {object} GeoJSON geometry drawn
     * @fires DRAWTOOL_EVENT_TYPE#END
     * @api
     */
    end() {
        if (this.state === DRAWTOOL_STATE.READY) return null;

        this._setState(INTERNAL_STATE.NOOP);

        const geojson = this.toGeoJSON();
        this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.END, geojson });

        if (this.resolve) {
            this.resolve(geojson);
        }
        this.resolve = null;
        this.reject = null;
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
    _endAfterEventloop() {
        setTimeout(() => this.end(), 0);
    }

    /**
     * Aborts current drawing (active or paused).
     *
     * @fires DRAWTOOL_EVENT_TYPE#ABORT
     * @api
     */
    reset() {
        if (this.state === DRAWTOOL_STATE.READY) return;

        this._setState(INTERNAL_STATE.NOOP);

        if (this.reject) {
            this.reject(new Error('aborted'));
            this.resolve = null;
            this.reject = null;
        }
        this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.ABORT });
        this._clean();
    }

    /**
     * Disposes of the object
     *
     * @api
     */
    dispose() {
        this.reset();
    }

    /**
     * Gets the current GeoJSON corresponding to the shape being drawn.
     * In case of polygons, ensures the shape is closed.
     *
     * Returns `null` if the state is
     * {@link module:interactions/DrawTool~DRAWTOOL_STATE.READY READY} or
     * if the shape is empty.
     *
     * @returns {object} GeoJSON object
     * @api
     */
    toGeoJSON() {
        if (this.state === DRAWTOOL_STATE.READY) return null;
        if (this.coordinates.length === 0) return null;

        // Deep clone
        const coords = this.coordinates.map(c => [c[0], c[1], c[2]]);
        if (this.nextPointCoordinates !== null) {
            // Add next point into geometry
            if (this.geometryType === GEOMETRY_TYPE.POLYGON) {
                coords.splice(-1, 0, this.nextPointCoordinates);
            } else {
                coords.push(this.nextPointCoordinates);
            }
        }

        let coordinates;
        switch (this.geometryType) {
            case GEOMETRY_TYPE.POINT:
                coordinates = coords[0];
                break;
            case GEOMETRY_TYPE.LINE:
            case GEOMETRY_TYPE.MULTIPOINT:
                coordinates = coords;
                break;
            case GEOMETRY_TYPE.POLYGON:
            default:
                {
                    // Polygon is always closed
                    const outerRing = coords;
                    coordinates = [outerRing];
                }
                break;
        }
        const geojson = {
            type: this.geometryType,
            coordinates,
        };
        return geojson;
    }

    /// PUBLIC MODIFIERS FUNCTIONS

    /**
     * Adds a new point at the end of the geometry.
     * If max point is reached, ends the drawing.
     *
     * @param {Vector3} coords Position of the new point
     * @fires DRAWTOOL_EVENT_TYPE#ADD
     * @fires DRAWTOOL_EVENT_TYPE#DRAWING
     * @fires DRAWTOOL_EVENT_TYPE#END If maxPoints reached
     * @api
     */
    addPointAt(coords) {
        let index = this.coordinates.length;
        if (this.geometryType === GEOMETRY_TYPE.POLYGON) {
            if (this.coordinates.length === 0) {
                // Push initial coords twice to close the polygon
                this.coordinates.push([coords.x, coords.y, coords.z]);
                this.coordinates.push([coords.x, coords.y, coords.z]);
            } else {
                this.coordinates.splice(-1, 0, [coords.x, coords.y, coords.z]);
                index--;
            }
        } else {
            this.coordinates.push([coords.x, coords.y, coords.z]);
        }

        this._updateInteractionsCapabilities();
        this._updatePoints3D();
        this.update();

        this.dispatchEvent({
            type: DRAWTOOL_EVENT_TYPE.ADD,
            at: coords,
            index,
        });
        this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.DRAWING });

        if (this.coordinates.length >= this.realMaxPoints) {
            this._endAfterEventloop();
        }
    }

    /**
     * Updates position of a point
     *
     * @param {number} pointIdx Point index to update
     * @param {Vector3} coords New position of the point
     * @fires DRAWTOOL_EVENT_TYPE#EDIT
     * @fires DRAWTOOL_EVENT_TYPE#DRAWING
     * @api
     */
    updatePointAt(pointIdx, coords) {
        this.coordinates[pointIdx] = [coords.x, coords.y, coords.z];

        // Update rendering
        this.pointsGroup.children[pointIdx].visible = true;
        this.pointsGroup.children[pointIdx].position.copy(coords);
        this.pointsGroup.children[pointIdx].updateMatrixWorld();
        this.instance.notifyChange(this.pointsGroup.children[pointIdx]);

        if (this.geometryType === GEOMETRY_TYPE.POLYGON) {
            // We have a closed polygon, also update last one if we update the first and vice-versa
            if (pointIdx === 0) {
                // We have a closed polygon, also update last one
                const lastIndex = this.pointsGroup.children.length - 1;
                this.pointsGroup.children[lastIndex].visible = true;
                this.pointsGroup.children[lastIndex].position.copy(coords);
                this.pointsGroup.children[lastIndex].updateMatrixWorld();
                this.instance.notifyChange(this.pointsGroup.children[lastIndex]);

                this.coordinates[this.coordinates.length - 1] = [coords.x, coords.y, coords.z];
            } else if (pointIdx === this.coordinates.length - 1) {
                this.pointsGroup.children[0].visible = true;
                this.pointsGroup.children[0].position.copy(coords);
                this.pointsGroup.children[0].updateMatrixWorld();
                this.instance.notifyChange(this.pointsGroup.children[0]);

                this.coordinates[0] = [coords.x, coords.y, coords.z];
            }
        }

        this.update();

        // If dragging, don't dispatch EDIT event from here, wait until drag is stopped
        if (
            this.internalState !== INTERNAL_STATE.DRAGGING
            && this.internalState !== INTERNAL_STATE.DRAGGING_STARTED
        ) {
            // Calling this from API, dispatch EDIT event
            this._updateEdges();

            // Dispatch event
            this.dispatchEvent({
                type: DRAWTOOL_EVENT_TYPE.EDIT,
                index: pointIdx,
                at: this.pointsGroup.children[pointIdx].position,
            });
        }
        this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.DRAWING });
    }

    /**
     * Deletes a point.
     *
     * @param {number} pointIdx Point index to delete
     * @fires DRAWTOOL_EVENT_TYPE#DELETE
     * @fires DRAWTOOL_EVENT_TYPE#DRAWING
     * @api
     */
    deletePoint(pointIdx) {
        if (
            this.geometryType === GEOMETRY_TYPE.POLYGON
            && (pointIdx === 0 || pointIdx === this.coordinates.length - 1)
        ) {
            // We have a closed polygon, delete first one and set last one to the "new" first
            this.coordinates.splice(0, 1);
            this.coordinates[this.coordinates.length - 1] = [
                this.coordinates[0][0],
                this.coordinates[0][1],
                this.coordinates[0][2],
            ];
        } else {
            this.coordinates.splice(pointIdx, 1);
        }

        this._updateInteractionsCapabilities();
        this._updatePoints3D();
        this.update();

        this.dispatchEvent({
            type: DRAWTOOL_EVENT_TYPE.DELETE,
            index: pointIdx,
        });
        this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.DRAWING });
    }

    /**
     * Inserts a new point at an index.
     * Note: it does *not* end the drawing if max point is reached.
     *
     * @param {number} pointIdx Point index
     * @param {Vector3} coords Position for the new point
     * @fires DRAWTOOL_EVENT_TYPE#ADD
     * @fires DRAWTOOL_EVENT_TYPE#DRAWING
     * @api
     */
    insertPointAt(pointIdx, coords) {
        this.coordinates.splice(pointIdx, 0, [coords.x, coords.y, coords.z]);
        if (this.geometryType === GEOMETRY_TYPE.POLYGON && pointIdx === 0) {
            this.coordinates[this.coordinates.length - 1] = [
                this.coordinates[0][0],
                this.coordinates[0][1],
                this.coordinates[0][2],
            ];
        }

        this._updateInteractionsCapabilities();
        this._updatePoints3D();
        this.update();

        this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.ADD, at: coords, index: pointIdx });
        this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.DRAWING });
    }

    /// INTERNAL GENERIC METHODS

    /**
     * Initializes common stuff when starting drawing for both editing & creating.
     *
     * @param {DRAWTOOL_MODE} mode Mode to start
     * @param {?GEOMETRY_TYPE} geometryType Geometry type to create
     * (if `null`, `geometry` must be provided)
     * @param {?object|Drawing} geometry Geometry to edit
     */
    _init(mode, geometryType, geometry) {
        this.mode = mode;

        this.coordinates = [];
        this.hideNextPoint = mode !== DRAWTOOL_MODE.CREATE;
        this.nextPoint3D = null;
        this.nextPointCoordinates = null;
        this.splicingPoint3D = null;
        this.splicingPointEdge = null;
        this.splicingPointCoordinates = null;
        this.draggedPointIndex = null;
        this.draggedPointChanged = false;

        if (geometry) {
            if (geometry instanceof Drawing) {
                this.geometryType = geometry.geometryType;
                this.drawObject = geometry;
            } else {
                // GeoJSON
                this.geometryType = geometry.type;
                this.drawObject = new Drawing(
                    this.instance, this.drawObjectOptions, geometry,
                );
            }

            // Get initial coordinates from drawObject
            const nbPoints = this.drawObject.coordinates.length / 3;
            for (let i = 0; i < nbPoints; i += 1) {
                this.coordinates.push([
                    this.drawObject.coordinates[i * 3 + 0],
                    this.drawObject.coordinates[i * 3 + 1],
                    this.drawObject.coordinates[i * 3 + 2],
                ]);
            }
        } else {
            this.geometryType = geometryType;
            this.drawObject = new Drawing(this.instance, this.drawObjectOptions);
        }

        if (this.geometryType === GEOMETRY_TYPE.POINT
            || this.geometryType === GEOMETRY_TYPE.MULTIPOINT
        ) {
            // Actually by-pass completely the drawobject, as we do
            // all rendering in this tool
            this.drawObject.clear();
            this.drawObject.removeFromParent();
        } else {
            this.instance.threeObjects.add(this.drawObject);
        }

        switch (this.geometryType) {
            case GEOMETRY_TYPE.POINT:
            case GEOMETRY_TYPE.MULTIPOINT:
                this.realMinPoints = this.minPoints ?? 1;
                this.realMaxPoints = this.maxPoints ?? Infinity;
                break;
            case GEOMETRY_TYPE.LINE:
                this.realMinPoints = this.minPoints ?? 2;
                this.realMaxPoints = this.maxPoints ?? Infinity;
                break;
            case GEOMETRY_TYPE.POLYGON:
                this.realMinPoints = (
                    this.minPoints !== null && this.minPoints !== undefined
                        ? Math.max(this.minPoints + 1, 4)
                        : 4
                );
                this.realMaxPoints = (
                    this.maxPoints !== null && this.maxPoints !== undefined
                        ? this.maxPoints + 1
                        : Infinity
                );
                break;
            default:
                // do nothing
        }

        this._updateInteractionsCapabilities();
        this._restoreDefaultState();

        this.pointsGroup = new Group();
        this.pointsGroup.name = 'drawtool-points';
        this.instance.threeObjects.add(this.pointsGroup);

        // Used for raycasting against the edges
        // (raycasting against the lines don't always work depending on the camera angle)
        this.edges = new Group();
        this.edges.name = 'drawtool-edges';
        this.instance.threeObjects.add(this.edges);

        this._updatePoints3D();
        this._createEventHandlers();
    }

    /**
     * Updates rendering
     */
    update() {
        if (this.state === DRAWTOOL_STATE.READY) return;

        this.drawObject.setGeojson(this.toGeoJSON());
    }

    /**
     * Cleans state so we can safely call start/edit again on this object.
     */
    _clean() {
        this._removeDrawings();
        this._cleanEventHandlers();
        this.state = DRAWTOOL_STATE.READY;
        this.internalState = INTERNAL_STATE.NOOP;
        this.mode = null;
        this.coordinates = null;
    }

    /**
     * Removes drawings: drawn shape & labels
     */
    _removeDrawings() {
        if (this.drawObject) {
            this.drawObject.removeFromParent();
            this.drawObject.dispose();
            this.drawObject = null;
            this.instance.notifyChange(this.instance.threeObjects);
        }

        if (this.pointsGroup) {
            for (const o of this.pointsGroup.children) {
                o.element.remove();
            }
            this.pointsGroup.clear();
            this.pointsGroup.removeFromParent();
            this.pointsGroup = null;
            this.instance.notifyChange(this.instance.threeObjects);
        }

        if (this.nextPoint3D) {
            this.nextPoint3D.element.remove();
            this.nextPoint3D.removeFromParent();
            this.nextPoint3D = null;
            this.instance.notifyChange(this.instance.threeObjects);
        }

        if (this.splicingPoint3D) {
            this.splicingPoint3D.element.remove();
            this.splicingPoint3D.removeFromParent();
            this.splicingPoint3D = null;
            this.instance.notifyChange(this.instance.threeObjects);
        }

        if (this.edges) {
            this.edges.clear();
            this.edges.removeFromParent();
            this.edges = null;
            this.instance.notifyChange(this.instance.threeObjects);
        }
    }

    /// STATE

    /**
     * Updates canSplice & canAddNewPoint based on mode, geometry and number of points.
     */
    _updateInteractionsCapabilities() {
        this.canSplice = (
            this.enableSplicing
            && this.coordinates.length < this.realMaxPoints
            && (
                this.geometryType === GEOMETRY_TYPE.LINE
                || this.geometryType === GEOMETRY_TYPE.POLYGON
            )
        );

        switch (this.mode) {
            case DRAWTOOL_MODE.CREATE:
                this.canAddNewPoint = this.coordinates.length < this.realMaxPoints;
                break;
            case DRAWTOOL_MODE.EDIT:
                this.canAddNewPoint = (
                    this.enableAddPointsOnEdit
                    && this.coordinates.length < this.realMaxPoints
                    && (
                        this.geometryType === GEOMETRY_TYPE.LINE
                        || this.geometryType === GEOMETRY_TYPE.MULTIPOINT
                    )
                );
                break;
            default:
                // do nothing
        }
    }

    /**
     * Restores default state depending on mode & geometry
     */
    _restoreDefaultState() {
        this._setState(this.canAddNewPoint ? INTERNAL_STATE.NEW_POINT : INTERNAL_STATE.NOOP);
    }

    /**
     * Pushes a new temporary state
     *
     * @param {INTERNAL_STATE} state State
     */
    _pushState(state) {
        this._oldState = this.internalState;
        this._setState(state);
    }

    /**
     * Restores from a temporary state.
     * If the state has changed since `_pushState`, will be ignored.
     *
     * @param {INTERNAL_STATE} state State
     */
    _popState(state) {
        if (state === this.internalState) {
            this._setState(this._oldState);
        }
    }

    /**
     * Updates internal state and handles display of points and their events
     *
     * @param {INTERNAL_STATE} state New state
     */
    _setState(state) {
        if (this.internalState === state) return;

        // Do stuff based on previous state
        // (we know the new one is different from the old one)
        switch (this.internalState) {
            case INTERNAL_STATE.OVER_EDGE:
                this._hideSplicingPoint();
                this.instance.viewport.style.cursor = 'auto';
                break;
            case INTERNAL_STATE.NEW_POINT:
                this._hideNextPoint();
                break;
            case INTERNAL_STATE.DRAGGING_STARTED:
            case INTERNAL_STATE.DRAGGING:
                if (
                    state === INTERNAL_STATE.NOOP
                    || state === INTERNAL_STATE.NEW_POINT
                ) {
                    this._setPointerEventsEnabled(true);
                }
                break;
            default:
                // do nothing
        }

        // Do stuff based on new state
        switch (state) {
            case INTERNAL_STATE.DRAGGING_STARTED:
                // Disable pointerEvents on all points
                // to make moving smooth
                this._setPointerEventsEnabled(false);
                break;
            case INTERNAL_STATE.OVER_EDGE:
                this.instance.viewport.style.cursor = 'pointer';
                break;
            default:
                // do nothing
        }

        this.internalState = state;
    }

    /// EVENTS

    /**
     * Creates event handlers for the interactions.
     * This is used when starting or resuming drawing.
     */
    _createEventHandlers() {
        if (this.state === DRAWTOOL_STATE.ACTIVE) return;

        this._eventHandlers = {
            mousedown: this._onMouseDown.bind(this),
            mouseup: this._onMouseUp.bind(this),
            mousemove: this._onMouseMove.bind(this),
            contextmenu: evt => evt.preventDefault(), // In case controls do not already do this
        };

        // Use mouseup event to correctly trigger when right-click is *released* (and not pressed)
        // (so we can use controls with right-click)
        this.instance.viewport.addEventListener('mousedown', this._eventHandlers.mousedown);
        this.instance.viewport.addEventListener('mouseup', this._eventHandlers.mouseup);
        this.instance.viewport.addEventListener('mousemove', this._eventHandlers.mousemove);
        this.instance.viewport.addEventListener('contextmenu', this._eventHandlers.contextmenu);
    }

    /**
     * Removes event handlers
     * This is used when pausing or ending drawing.
     */
    _cleanEventHandlers() {
        if (this.state !== DRAWTOOL_STATE.ACTIVE) return;

        if (this.instance && this._eventHandlers) {
            this.instance.viewport.removeEventListener('mousedown', this._eventHandlers.mousedown);
            this.instance.viewport.removeEventListener('mouseup', this._eventHandlers.mouseup);
            this.instance.viewport.removeEventListener('mousemove', this._eventHandlers.mousemove);
            this.instance.viewport.removeEventListener('contextmenu', this._eventHandlers.contextmenu);
            this._eventHandlers = null;
        }
    }

    /**
     * Generic mousedown handler
     *
     * @param {MouseEvent} evt Mouse event
     */
    _onMouseDown(evt) {
        let res = false;
        if (evt.button === 0) {
            if (this.enableDragging && this.internalState === INTERNAL_STATE.OVER_EDGE) {
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
     * @param {MouseEvent} evt Mouse event
     */
    _onMouseUp(evt) {
        let res = false;
        if (evt.button === 0) {
            // First, check if we are clicking on the first point of a polygon
            // to close the shape
            if (this.internalState === INTERNAL_STATE.DRAGGING_STARTED) {
                if (this.enableDragging
                    && this.mode === DRAWTOOL_MODE.CREATE
                    && this.geometryType === GEOMETRY_TYPE.POLYGON
                    && this.draggedPointIndex === 0
                ) {
                    // Abort dragging - bypass states to avoid creating a new point
                    this.draggedPointIndex = null;
                    this.instance.controls.enabled = true;

                    this._endAfterEventloop();
                    res = true;
                }
            }

            if (!res && !this.enableDragging && this.internalState === INTERNAL_STATE.OVER_EDGE) {
                // Point displayed is on edge, but because of hit tolerance the cursor
                // might not be over the displayed point, so also handle event here
                this._spliceAndStartDrag();
                res = true;
            }

            // Then, check other interactions:
            if (!res && (
                this.internalState === INTERNAL_STATE.DRAGGING
                || this.internalState === INTERNAL_STATE.DRAGGING_STARTED
            )) {
                // Were we dragging a point?
                res = this._endDraggingPoint();
            } else if (this.internalState === INTERNAL_STATE.NEW_POINT) {
                // Were we clicking for a new point?
                res = this._tryAddNewPoint(evt);
            }
            // Do nothing with that event
        } else if (evt.button === 2 && this.endDrawingOnRightClick) {
            res = this._tryEndDraw(evt);
        }

        // If we have done something with that event, capture it
        if (res) evt.stopPropagation();
    }

    /**
     * Generic mousemove handler
     *
     * @param {MouseEvent} evt Mouse event
     */
    _onMouseMove(evt) {
        let res = false;

        if (
            this.internalState === INTERNAL_STATE.DRAGGING_STARTED
            || this.internalState === INTERNAL_STATE.DRAGGING
        ) {
            // A point is being dragged, move it
            res = this._tryMovePoint(evt);
        } else if (this.internalState === INTERNAL_STATE.OVER_POINT) {
            // we're hovering a point, do nothing
        } else {
            if (this.canSplice) {
                // Are we close to an edge for splicing?
                res = this._tryShowSplicePoint(evt);
                if (res) {
                    // We found a point
                    this._setState(INTERNAL_STATE.OVER_EDGE);
                } else if (this.internalState === INTERNAL_STATE.OVER_EDGE) {
                    // No point anymore, restore
                    this._restoreDefaultState();
                }
            }

            if (!res
                && this.canAddNewPoint
                && this.internalState === INTERNAL_STATE.NEW_POINT
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
     * @param {MouseEvent} evt Mouse event
     * @returns {boolean} `true` if a point is added, or `false` if no point available
     * under the mouse
     */
    _tryAddNewPoint(evt) {
        if (this.internalState !== INTERNAL_STATE.NEW_POINT) {
            console.warn('_tryAddNewPoint with unexpected state', this.internalState);
            return false;
        }

        const picked = this.getPointAt(evt);
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
     * @param {MouseEvent} evt Mouse event
     * @returns {boolean} `true` if the drawing was ended, or `false` otherwise (e.g. not enough
     * points for polygon)
     */
    // eslint-disable-next-line no-unused-vars
    _tryEndDraw(evt) {
        // have we picked up enough point?
        if (this.coordinates.length < this.realMinPoints) return false;
        this._endAfterEventloop();
        return true;
    }

    /**
     * Tries to show the next point at the cursor
     *
     * @param {MouseEvent} evt Mouse event
     * @returns {boolean} `true` if there is a point, or `false` otherwise
     */
    _tryShowNextPoint(evt) {
        if (this.internalState !== INTERNAL_STATE.NEW_POINT) {
            console.warn('_tryShowNextPoint with unexpected state', this.internalState);
            return false;
        }

        const picked = this.getPointAt(evt);
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
     * @param {MouseEvent} evt Mouse event
     * @returns {boolean} `true` if there is a point, or `false` otherwise
     */
    _tryShowSplicePoint(evt) {
        if (
            this.internalState !== INTERNAL_STATE.NOOP
            && this.internalState !== INTERNAL_STATE.NEW_POINT
            && this.internalState !== INTERNAL_STATE.OVER_EDGE
        ) {
            console.warn('_tryShowSplicePoint with unexpected state', this.internalState);
            return false;
        }

        const mouse = this.instance.eventToCanvasCoords(evt, tmpCoords);
        const pointer = this.instance.canvasToNormalizedCoords(mouse, tmpCoords);
        raycaster.setFromCamera(pointer, this.instance.camera.camera3D);
        const picked = raycaster.intersectObject(this.edges, true);

        if (picked.length === 0) {
            return false;
        }

        picked[0].object._line.closestPointToPoint(picked[0].point, true, tmpCoords);
        this._updateSplicingPoint(picked[0].object._edgeIndex, tmpCoords);
        return true;
    }

    /**
     * Tries to move a selected point
     *
     * @param {MouseEvent} evt Mouse event
     * @returns {boolean} `true` if a point is updated, `false` otherwise
     */
    _tryMovePoint(evt) {
        if (
            this.internalState !== INTERNAL_STATE.DRAGGING_STARTED
            && this.internalState !== INTERNAL_STATE.DRAGGING
        ) {
            console.warn('_tryMovePoint with unexpected state', this.internalState);
            return false;
        }

        const picked = this.getPointAt(evt);
        if (!picked || !picked.picked) {
            // If we don't have a "real" point picked, just ignore the new position
            // so it doesn't go in the limbo
            return false;
        }

        this._setState(INTERNAL_STATE.DRAGGING);
        this.updatePointAt(this.draggedPointIndex, picked.point);
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
    _updatePoints3D() {
        // First clean the existing 2D & 3D points
        for (const o of this.pointsGroup.children) {
            o.element.remove();
        }
        this.pointsGroup.clear();

        // Create new ones
        const nbPoints = this.coordinates.length;

        for (let i = 0; i < nbPoints; i += 1) {
            const pt = this.point2DFactory(`${i + 1}`);
            pt.style.pointerEvents = 'auto';
            pt.style.cursor = 'pointer';
            const pt3d = new CSS2DObject(pt);
            pt3d.renderOrder = 1;
            pt3d.position.set(
                this.coordinates[i][0], this.coordinates[i][1], this.coordinates[i][2],
            );
            pt3d.updateMatrixWorld();
            this.pointsGroup.add(pt3d);

            // if drag-and-drop: mouseup event is handled in generic _onMouseUp
            // if on click: we bind to click to not interfer with general mouseup
            pt.addEventListener(this.enableDragging ? 'mousedown' : 'click', evt => {
                if (evt.button === 0) {
                    this._startDraggingPoint(i);
                    evt.stopPropagation();
                }
            });

            // Hide the next point & splicing point if we're close to a point
            pt.addEventListener('mouseover', () => this._pushState(INTERNAL_STATE.OVER_POINT));
            pt.addEventListener('mouseout', () => this._popState(INTERNAL_STATE.OVER_POINT));

            if (this.canAddNewPoint) {
                // We *should* always bind click event on pt if polygon and pt is the first point
                // to close the shape, but it does not work with drag and drop (event is swallowed
                // by drag and drop, so it's (also) handled in _onMouseUp
                if (!this.enableDragging
                    && this.geometryType === GEOMETRY_TYPE.POLYGON
                    && i === 0
                ) {
                    pt.addEventListener('click', evt => {
                        this._endAfterEventloop();
                        evt.stopPropagation();
                    });
                }
            }
        }

        if (this.canAddNewPoint) {
            const nextPointNumber = (
                this.geometryType === GEOMETRY_TYPE.POLYGON && nbPoints > 0
                    ? nbPoints
                    : nbPoints + 1
            );
            if (this.nextPoint3D) {
                this.nextPoint3D.element.innerText = `${nextPointNumber}`;
            } else {
                const nextPoint2D = this.point2DFactory(`${nextPointNumber}`);
                this.nextPoint3D = new CSS2DObject(nextPoint2D);
                this.nextPoint3D.name = 'next-point';
                this.instance.threeObjects.add(this.nextPoint3D);
            }
        }

        this._updateEdges();
    }

    /**
     * Updates edges for splicing.
     */
    _updateEdges() {
        const nbPoints = this.coordinates.length;
        const edgeSize = (
            // this.splicingHitTolerance can be null for auto
            // this.drawObject.extrudeDepth can be undefined if we just started drawing a line
            this.splicingHitTolerance ?? Math.max((this.drawObject.extrudeDepth ?? 10) * 1.5, 15)
        );

        this.edges.clear();

        for (let i = 1; i < nbPoints; i += 1) {
            // We need to use new Vector3s to pass them to Line object
            const start = new Vector3(
                this.coordinates[i - 1][0],
                this.coordinates[i - 1][1],
                this.coordinates[i - 1][2],
            );
            const end = new Vector3(
                this.coordinates[i][0], this.coordinates[i][1], this.coordinates[i][2],
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
            const edge = new Mesh(boxGeom, emptyMaterial);
            edge.setRotationFromQuaternion(tmpQuat);
            edge.position.copy(tmpVec3);
            edge.visible = false;
            edge.updateMatrix();
            edge.updateMatrixWorld(true);

            // Add metadata for picking
            edge._edgeIndex = i - 1;
            edge._line = new Line3(start, end);
            this.edges.add(edge);
        }
        this.instance.notifyChange(this.edges);
    }

    /// INTERACTIONS

    /**
     * Splices at the current position and starts dragging the new point
     */
    _spliceAndStartDrag() {
        const idx = this.splicingPointEdge + 1;
        this.insertPointAt(idx, this.splicingPointCoordinates);
        this._hideSplicingPoint();
        this._startDraggingPoint(idx);
    }

    /**
     * Sets up stuff required for dragging a point.
     * Could be on mousedown (if `enableDragging`) or click (if `!enableDragging`)!
     *
     * @param {number} idx Index of the point
     */
    _startDraggingPoint(idx) {
        if (this.enableDragging) {
            // Make sure controls are disabled while we are dragging
            this.instance.controls.enabled = false;
        }

        this._setState(INTERNAL_STATE.DRAGGING_STARTED);
        this.draggedPointIndex = idx;
    }

    /**
     * Sends `edit` event and cleans up stuff required after dragging a point.
     *
     * @returns {boolean} `true` if point was really dragged or `false` if it was a noop.
     */
    _endDraggingPoint() {
        this._updateEdges();
        const hasChanged = this.internalState === INTERNAL_STATE.DRAGGING;

        if (hasChanged) {
            // Dispatch event
            this.dispatchEvent({
                type: DRAWTOOL_EVENT_TYPE.EDIT,
                index: this.draggedPointIndex,
                at: this.pointsGroup.children[this.draggedPointIndex].position,
            });
            this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.DRAWING });
        }

        // Clean-up
        this.draggedPointIndex = null;
        if (this.enableDragging) {
            this.instance.controls.enabled = true;
        }

        this._restoreDefaultState();

        return hasChanged;
    }

    /**
     * Displays the next point to add
     *
     * @param {Vector3} coords Position
     */
    _updateNextPoint(coords) {
        if (
            this.internalState !== INTERNAL_STATE.NEW_POINT
            && this.internalState !== INTERNAL_STATE.OVER_EDGE
        ) {
            console.warn('_updateNextPoint with unexpected state', this.internalState);
            return;
        }

        this.nextPoint3D.visible = true;
        this.nextPoint3D.position.copy(coords);
        this.nextPoint3D.updateMatrixWorld();
        this.instance.notifyChange(this.nextPoint3D);

        // update the last position
        this.nextPointCoordinates = [coords.x, coords.y, coords.z];
        this.update();
        this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.DRAWING });
    }

    /**
     * Hides the next point, so it's simply not visible
     */
    _hideNextPoint() {
        if (this.nextPoint3D) {
            this.nextPoint3D.visible = false;
            this.nextPointCoordinates = null;
            this.instance.notifyChange(this.nextPoint3D);
            this.update();
            this.dispatchEvent({ type: DRAWTOOL_EVENT_TYPE.DRAWING });
        }
    }

    /**
     * Display a point for splicing along an edge
     *
     * @param {number} edgeIndex Edge index
     * @param {Vector3} coords Position of the point
     */
    _updateSplicingPoint(edgeIndex, coords) {
        if (
            this.internalState !== INTERNAL_STATE.NOOP
            && this.internalState !== INTERNAL_STATE.NEW_POINT
            && this.internalState !== INTERNAL_STATE.OVER_EDGE
        ) {
            console.warn('_updateSplicingPoint with unexpected state', this.internalState);
            return;
        }

        this.splicingPointCoordinates = coords.clone();
        this.splicingPointEdge = edgeIndex;

        if (this.splicingPoint3D === null) {
            const pt = this.point2DFactory(' ');
            pt.style.pointerEvents = 'auto';
            pt.style.cursor = 'pointer';
            this.splicingPoint3D = new CSS2DObject(pt);
            this.instance.threeObjects.add(this.splicingPoint3D);
            this.instance.notifyChange(this.instance.threeObjects);

            // if drag-and-drop: mouseup event is handled in generic _onMouseUp
            // if on click: we bind to click to not interfer with general mouseup
            this.splicingPoint3D.element.addEventListener(this.enableDragging ? 'mousedown' : 'click', evt => {
                if (evt.button === 0) {
                    this._spliceAndStartDrag();
                    evt.stopPropagation();
                }
            });
        }

        this.splicingPoint3D.visible = true;

        // Make sure splicing point is always *behind* any node point
        this.splicingPoint3D.renderOrder = -1;
        if (parseInt(window.__THREE__, 10) < 138) {
            // Ugly workaround, set splicing point *really* behind for display
            tmpCoords.copy(coords)
                .sub(this.instance.camera.camera3D.position)
                .multiplyScalar(1.01)
                .add(this.instance.camera.camera3D.position);
            this.splicingPoint3D.position.copy(tmpCoords);
            this.splicingPoint3D.updateMatrixWorld();
        } else {
            this.splicingPoint3D.position.copy(coords);
            this.splicingPoint3D.updateMatrixWorld();
        }

        this.instance.notifyChange(this.splicingPoint3D);
    }

    /**
     * Removes the point for splicing (if exists)
     */
    _hideSplicingPoint() {
        if (this.splicingPoint3D) {
            this.splicingPoint3D.visible = false;
            this.splicingPointCoordinates = null;
            this.splicingPointEdge = null;
            this.instance.notifyChange(this.splicingPoint3D);
        }
    }

    /**
     * Enables or disables pointer events for all CSS2D points.
     * This is useful to disable for performance while dagging for instance.
     *
     * @param {boolean} enable Enable or disable
     */
    _setPointerEventsEnabled(enable) {
        for (const o of this.pointsGroup.children) {
            o.element.style.pointerEvents = enable ? 'auto' : 'none';
            o.element.style.cursor = enable ? 'pointer' : 'auto';
        }
    }
}

export default DrawTool;
