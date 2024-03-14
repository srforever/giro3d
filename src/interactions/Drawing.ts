import Earcut from 'earcut';
import {
    Box3,
    BufferAttribute,
    BufferGeometry,
    BackSide,
    DoubleSide,
    FrontSide,
    Group,
    Line,
    LineBasicMaterial,
    Mesh,
    MeshBasicMaterial,
    Plane,
    PlaneGeometry,
    Vector3,
    PointsMaterial,
    Points,
} from 'three';
import type { Material } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type DrawingCollection from '../entities/DrawingCollection';
import GeoJSONUtils from '../utils/GeoJSONUtils';

const planesGeom = new PlaneGeometry(100, 100);

const defaultFaceMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0.2,
});
const defaultSideMaterial = new MeshBasicMaterial({
    color: 0x347330,
    opacity: 0.6,
});
const defaultLineMaterial = new LineBasicMaterial({
    color: 0x1b3c19,
});
const defaultPointMaterial = new PointsMaterial({
    color: 0x347330,
    size: 10,
});
const defaultPlaneHelperMaterial = new MeshBasicMaterial({
    side: DoubleSide,
    color: 0xffff00,
    opacity: 0.5,
    transparent: true,
    wireframe: true,
});

const tmpVec3s = [new Vector3(), new Vector3(), new Vector3()];
const tmpBox3 = new Box3();

const STRIDE3D = 3;

/**
 * Types of geometries to draw.
 */
export type DrawingGeometryType = 'Point' | 'MultiPoint' | 'LineString' | 'Polygon';

/**
 * Callback to create a HTML element for points for CSS2DObject.
 *
 * For picking to work correctly, the returned DOM element must:
 * - have `pointerEvents` to `none`,
 * - fill more or less its bounding box
 *
 * @param text - Text to display
 * @returns HTML element for the point
 */
export type Point2DFactory = (text: string) => HTMLElement;

/**
 * Material options.
 */
export interface MaterialsOptions {
    /** Material to be used for faces */
    faceMaterial?: Material;
    /** Material to be used for the extruded sides */
    sideMaterial?: Material;
    /** Material to be used for the borders */
    lineMaterial?: LineBasicMaterial;
    /** Material to be used for the points (not used if `use3Dpoints` is `false`) */
    pointMaterial?: PointsMaterial;
    /** Material to be used for the plane helper (if visible) */
    planeHelperMaterial?: Material;
}

/**
 * Drawing options.
 */
export interface DrawingOptions extends MaterialsOptions {
    /** Name for this shape */
    name?: string;
    /**
     * Minimum depth for the extrusion
     *
     * @defaultValue 1
     */
    minExtrudeDepth?: number;
    /**
     * Maximum depth for the extrusion
     *
     * @defaultValue 5
     */
    maxExtrudeDepth?: number;
    /**
     * Render points as 3D objects - if false, may provide `point2DFactory` option
     *
     * @defaultValue false
     */
    use3Dpoints?: boolean;
    /**
     * Callback for creating DOM element for points for CSS2DObject - used only if
     * `use3Dpoints` is `false`).
     *
     * For picking to work correctly, the returned DOM element must:
     * - have `pointerEvents` to `none`,
     * - fill more or less its bounding box
     */
    point2DFactory?: Point2DFactory;
    /**
     * True to make the plane helper visible.
     * When drawing the shape, we project the points on a plane for triangulation. This enables
     * seeing the plane used for projecting while debugging.
     *
     * @defaultValue false
     */
    planeHelperVisible?: boolean;
    /**
     * Initial number of points to allocate when drawing
     *
     * @defaultValue 100
     */
    pointsBudget?: number;
}

/**
 * Default Point2D factory for creating labels.
 *
 * @param text - Text to display
 * @returns DOM Element to attach to the CSS2DObject
 */
function defaultPoint2DFactory(text: string): HTMLElement {
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

/**
 * Simple geometry object for drawing.
 *
 * Instanciated via {@link DrawTool}, but can also be added to {@link DrawingCollection} to
 * view and edit simple geometries.
 */
class Drawing extends Group {
    public readonly isDrawing: boolean = true;
    public entity?: DrawingCollection;

    private _minExtrudeDepth: number;
    private _maxExtrudeDepth: number;
    private _faceMaterial: Material;
    private _backfaceMaterial: Material | undefined;
    private _sideMaterial: Material;
    private _lineMaterial: LineBasicMaterial;
    private _pointMaterial: PointsMaterial;
    private _use3Dpoints: boolean;
    private _point2DFactory: Point2DFactory;
    private _planeHelperMaterial: Material;
    private _planeHelperVisible: boolean;
    private _pointsBudget: number;

    private _plane: Plane;
    private _planeHelper: Mesh | undefined;
    private _extrudeDepth: number | undefined;
    private _center: Vector3;
    private _coordinates: number[];
    private _geometryType: DrawingGeometryType | null;

    private _positions: Float32Array | undefined;
    private _positionsBuffer: BufferAttribute | undefined;
    private _pointsGeometry: BufferGeometry | undefined;
    private _points: Points | undefined;

    private _positionsTop: Float32Array | undefined;
    private _positionsTopBuffer: BufferAttribute | undefined;
    private _positionsBottom: Float32Array | undefined;
    private _positionsBottomBuffer: BufferAttribute | undefined;
    private _positionsSide: Float32Array | undefined;
    private _positionsSideBuffer: BufferAttribute | undefined;
    private _lineTopGeometry: BufferGeometry | undefined;
    private _lineBottomGeometry: BufferGeometry | undefined;
    private _sideGeometry: BufferGeometry | undefined;
    private _lineTop: Line | undefined;
    private _lineBottom: Line | undefined;
    private _side: Mesh | undefined;

    private _surfaceTopGeometry: BufferGeometry | undefined;
    private _surfaceBottomGeometry: BufferGeometry | undefined;
    private _surfaceTop: Mesh | undefined;
    private _surfaceBottom: Mesh | undefined;

    /** Computed extrude depth, based on the geometry and min/max parameters */
    public get extrudeDepth(): number | undefined { return this._extrudeDepth; }
    /** Get flat coordinates of the geometry */
    public get coordinates(): number[] { return this._coordinates; }
    /** Get local flat coordinates (in 3d) */
    public get localCoordinates(): Float32Array { return this._positionsTop; }
    /** Get the geometry type of the object */
    public get geometryType(): DrawingGeometryType | null { return this._geometryType; }
    /** Returns whether we're rendering points as 3D objects or not */
    public get use3Dpoints() { return this._use3Dpoints; }
    /**
     * Updates the rendering of points.
     * You'll need to call `instance.notifyChange()` to notify the changes.
     */
    public set use3Dpoints(value: boolean) {
        this.clear();
        this._use3Dpoints = value;
        this.refresh();
    }

    /**
     * Creates a new 3D Object
     *
     * @param options - Options
     * @param geojson - Initial GeoJSON geometry
     */
    constructor(
        options: DrawingOptions = {},
        geojson: GeoJSON.Geometry = null,
    ) {
        super();
        this.name = options.name ?? 'drawobject';
        this._minExtrudeDepth = options.minExtrudeDepth ?? 1;
        this._maxExtrudeDepth = options.maxExtrudeDepth ?? 5;
        this._faceMaterial = options.faceMaterial ?? defaultFaceMaterial;
        this._sideMaterial = options.sideMaterial ?? defaultSideMaterial;
        this._lineMaterial = options.lineMaterial ?? defaultLineMaterial;
        this._pointMaterial = options.pointMaterial ?? defaultPointMaterial;
        this._use3Dpoints = options.use3Dpoints ?? true;
        this._point2DFactory = options.point2DFactory ?? defaultPoint2DFactory;
        this._planeHelperMaterial = options.planeHelperMaterial ?? defaultPlaneHelperMaterial;
        this._planeHelperMaterial.depthTest = false;
        this._planeHelperMaterial.depthWrite = false;
        this._planeHelperVisible = options.planeHelperVisible ?? false;
        this._pointsBudget = options.pointsBudget ?? 100;

        if (typeof this._minExtrudeDepth !== 'number' || this._minExtrudeDepth < 0) {
            throw new Error('minExtrudeDepth should be a non-negative number');
        }
        if (typeof this._maxExtrudeDepth !== 'number' || this._maxExtrudeDepth < 0) {
            throw new Error('maxExtrudeDepth should be a non-negative number');
        }
        if (this._maxExtrudeDepth < this._minExtrudeDepth) {
            throw new Error('maxExtrudeDepth should be greater or equal to minExtrudeDepth');
        }
        if (typeof this._pointsBudget !== 'number' || this._pointsBudget <= 0) {
            throw new Error('pointsBudget should be a positive number');
        }

        this._doSanityChecksMaterials();

        this._plane = new Plane();
        this._center = new Vector3();

        if (geojson) {
            // Will allocate buffers with optimal size
            this.setGeojson(geojson);
        } else {
            // Don't allocate buffers yet, we'll allocate them when needed
            this._coordinates = [];
            this._geometryType = null;
        }
    }

    /**
     * Disposes of the object
     */
    dispose(): void {
        for (const o of this.children) {
            const material = (o as any).material;
            const geometry = (o as any).geometry;

            if (material && 'dispose' in material && typeof material.dispose === 'function') {
                material.dispose();
            }
            if (geometry && 'dispose' in geometry && typeof geometry.dispose === 'function') {
                geometry.dispose();
            }
        }
        this.clear();
    }

    /**
     * Removes all child objects.
     * You'll need to call `instance.notifyChange()` to notify the changes.
     */
    clear(): this {
        if (!this._use3Dpoints && (this.geometryType === 'Point' || this.geometryType === 'MultiPoint')) {
            for (const o of this.children as CSS2DObject[]) {
                o.element.remove();
            }
        }
        return super.clear();
    }

    /**
     * Initializes buffers & geometries for drawing points
     *
     * @param size - Number of points to allocate
     */
    private _initPointsBuffers(size: number): void {
        this._positions = new Float32Array(size * STRIDE3D);
        this._positionsBuffer = new BufferAttribute(this._positions, STRIDE3D);

        this._pointsGeometry = new BufferGeometry();
        this._pointsGeometry.setAttribute('position', this._positionsBuffer);

        this._points = new Points(this._pointsGeometry, this._pointMaterial);
    }

    /**
     * Initializes buffers & geometries for drawing lines
     *
     * @param size - Number of points to allocate
     */
    private _initLineBuffers(size: number): void {
        this._positionsTop = new Float32Array(size * STRIDE3D);
        this._positionsTopBuffer = new BufferAttribute(this._positionsTop, STRIDE3D);

        this._positionsBottom = new Float32Array(size * STRIDE3D);
        this._positionsBottomBuffer = new BufferAttribute(this._positionsBottom, STRIDE3D);

        this._positionsSide = new Float32Array(size * 2 * STRIDE3D);
        this._positionsSideBuffer = new BufferAttribute(this._positionsSide, STRIDE3D);

        this._lineTopGeometry = new BufferGeometry();
        this._lineTopGeometry.setAttribute('position', this._positionsTopBuffer);

        this._lineBottomGeometry = new BufferGeometry();
        this._lineBottomGeometry.setAttribute('position', this._positionsBottomBuffer);

        this._sideGeometry = new BufferGeometry();
        this._sideGeometry.setAttribute('position', this._positionsSideBuffer);
        this._sideGeometry.setIndex([]);

        this._lineTop = new Line(this._lineTopGeometry, this._lineMaterial);
        this._lineTop.name = 'lineTop';
        this._lineTop.renderOrder = 1;
        this._lineBottom = new Line(this._lineBottomGeometry, this._lineMaterial);
        this._lineBottom.name = 'lineBottom';
        this._side = new Mesh(this._sideGeometry, this._sideMaterial);
        this._side.name = 'side';
    }

    /**
     * Initializes buffers & geometries for drawing polygons
     *
     * @param size - Number of points to allocate
     */
    private _initPolygonBuffers(size: number): void {
        this._initLineBuffers(size);

        this._surfaceTopGeometry = new BufferGeometry();
        this._surfaceTopGeometry.setAttribute('position', this._positionsTopBuffer);
        this._surfaceTopGeometry.setIndex([]);

        this._surfaceBottomGeometry = new BufferGeometry();
        this._surfaceBottomGeometry.setAttribute('position', this._positionsBottomBuffer);
        this._surfaceBottomGeometry.setIndex([]);

        this._surfaceTop = new Mesh(this._surfaceTopGeometry, this._faceMaterial);
        this._surfaceTop.name = 'surfaceTop';
        this._surfaceBottom = new Mesh(this._surfaceBottomGeometry, this._backfaceMaterial);
        this._surfaceBottom.name = 'surfaceBottom';
    }

    /**
     * Initializes or resizes buffers and geometries for current shape
     */
    private _prepareBuffers(): void {
        const nbPoints = this.coordinates.length / STRIDE3D;

        // First we check if buffers are created, or need to be resized
        switch (this.geometryType) {
            case 'Point':
            case 'MultiPoint':
                if (this._use3Dpoints) {
                    if (!this._points) {
                        this._initPointsBuffers(nbPoints);
                    } else if (this._positions.length < this.coordinates.length) {
                        // Need to resize the buffers & all
                        this._initPointsBuffers(
                            Math.max(
                                this._positions.length / STRIDE3D + this._pointsBudget,
                                nbPoints,
                            ),
                        );
                    }
                }
                break;

            case 'LineString':
                if (!this._lineTop) {
                    this._initLineBuffers(nbPoints);
                } else if (this._positionsTop.length < this.coordinates.length) {
                    // Need to resize the buffers & all
                    this._initLineBuffers(
                        Math.max(
                            this._positionsTop.length / STRIDE3D + this._pointsBudget,
                            nbPoints,
                        ),
                    );
                }
                break;

            case 'Polygon':
                if (!this._surfaceTop) {
                    this._initPolygonBuffers(nbPoints);
                } else if (this._positionsTop.length < this.coordinates.length) {
                    // Need to resize the buffers & all
                    this._initPolygonBuffers(
                        Math.max(
                            this._positionsTop.length / STRIDE3D + this._pointsBudget,
                            nbPoints,
                        ),
                    );
                }
                break;

            default:
                throw new Error(`Invalid geometry type ${this.geometryType}`);
        }
    }

    /**
     * Forces update from the coordinates.
     * You'll need to call `instance.notifyChange()` to notify the changes.
     */
    refresh() {
        this.setCoordinates(this.coordinates, this.geometryType);
    }

    /**
     * Sets the shape to draw.
     * You'll need to call `instance.notifyChange()` to notify the changes.
     *
     * @param geojson - GeoJSON shape to draw
     */
    setGeojson(geojson: GeoJSON.Geometry): void {
        if (!geojson) return;
        const flatCoordinates = GeoJSONUtils.toFlatCoordinates(geojson);
        this.setCoordinates(flatCoordinates, geojson.type as DrawingGeometryType);
    }

    /**
     * Sets the shape to draw.
     * You'll need to call `instance.notifyChange()` to notify the changes.
     *
     * @param coordinates - Array of flat coordinates
     * @param geometryType - Type of geometry
     */
    setCoordinates(coordinates: number[], geometryType: DrawingGeometryType): void {
        // Remove all children
        this.clear();

        const nbPoints = coordinates.length / STRIDE3D;

        if (nbPoints > 0) {
            this._geometryType = geometryType;

            switch (geometryType) {
                case 'Point':
                case 'MultiPoint':
                    if (nbPoints < 1) {
                        // Not a point, do nothing
                        break;
                    }

                    this._coordinates = coordinates;
                    this._drawPoints();
                    break;

                case 'LineString':
                    if (nbPoints < 2) {
                        // A single point is selected, do nothing
                        break;
                    }

                    // Check if 2 last points are not the same
                    // can happen, when the user just clicked on a point and did not move the
                    // mouse (-> hovered point is the same one as clicked)
                    if (
                        (
                            coordinates[(nbPoints - 1) * STRIDE3D + 0]
                            === coordinates[(nbPoints - 2) * STRIDE3D + 0]
                        ) && (
                            coordinates[(nbPoints - -1) * STRIDE3D + 1]
                            === coordinates[(nbPoints - 2) * STRIDE3D + 1]
                        ) && (
                            coordinates[(nbPoints - 1) * STRIDE3D + 2]
                            === coordinates[(nbPoints - 2) * STRIDE3D + 2]
                        )
                    ) {
                        coordinates = coordinates.slice(0, -STRIDE3D);
                    }

                    this._coordinates = coordinates;
                    this._drawLine();
                    break;

                case 'Polygon':
                    // Polygon is closed, so:
                    // - 2 points means there is only one "real" point,
                    // - 3 points means there are 2 "real" points

                    if (nbPoints < 3) {
                        // A single point is selected, do nothing
                        break;
                    }
                    if (nbPoints < 4) {
                        // Only two points are there, draw as a line
                        this._coordinates = coordinates.slice(0, -STRIDE3D);
                        this._drawLine();
                        break;
                    }
                    if (nbPoints === 4) {
                        // We might have a degenerate polygon (e.g. last & previous points are
                        // the same), typically when the user just clicked on a point and did
                        // not move the mouse (-> hovered point is the same one as clicked)
                        if (
                            coordinates[1 * STRIDE3D + 0] === coordinates[2 * STRIDE3D + 0]
                            && coordinates[1 * STRIDE3D + 1] === coordinates[2 * STRIDE3D + 1]
                            && coordinates[1 * STRIDE3D + 2] === coordinates[2 * STRIDE3D + 2]
                        ) {
                            this._coordinates = coordinates.slice(0, -2 * STRIDE3D);
                            this._drawLine();
                            break;
                        }
                    }
                    this._coordinates = coordinates;
                    this._drawPolygon();
                    break;

                default:
                    this._geometryType = null;
                    throw new Error(`Invalid geometry type ${geometryType}`);
            }
        } else {
            this._geometryType = null;
        }
    }

    /**
     * Gets the current GeoJSON corresponding to this shape.
     *
     * Returns `null` if the shape is empty.
     *
     * @returns GeoJSON geometry object
     */
    toGeoJSON(): GeoJSON.Geometry {
        if (this._coordinates.length === 0) return null;
        return GeoJSONUtils.fromFlatCoordinates(this._coordinates, this._geometryType);
    }

    /**
     * Sets materials for this object.
     * You'll need to call `instance.notifyChange()` to notify the changes.
     *
     * @param options - Materials
     */
    setMaterials(options: MaterialsOptions): void {
        this._faceMaterial = options.faceMaterial ?? defaultFaceMaterial;
        this._sideMaterial = options.sideMaterial ?? defaultSideMaterial;
        this._lineMaterial = options.lineMaterial ?? defaultLineMaterial;
        this._pointMaterial = options.pointMaterial ?? defaultPointMaterial;
        this._planeHelperMaterial = options.planeHelperMaterial ?? defaultPlaneHelperMaterial;

        this._doSanityChecksMaterials();

        if (this._points) {
            this._points.material = this._pointMaterial;
        }
        if (this._lineTop) {
            this._lineTop.material = this._lineMaterial;
            this._lineBottom.material = this._lineMaterial;
        }
        if (this._surfaceTop) {
            this._surfaceTop.material = this._faceMaterial;
            this._surfaceBottom.material = this._backfaceMaterial;
        }
        if (this._side) {
            this._side.material = this._sideMaterial;
        }
    }

    /**
     * Makes sure materials are correctly set for optimal display
     * (e.g. sides rendering & depth settings)
     */
    private _doSanityChecksMaterials(): void {
        this._faceMaterial.side = FrontSide;
        this._backfaceMaterial = this._faceMaterial.clone();
        this._backfaceMaterial.side = BackSide;
        this._sideMaterial.side = DoubleSide;

        [this._faceMaterial, this._backfaceMaterial, this._sideMaterial].forEach(m => {
            m.depthWrite = false;
            if (m.opacity !== 1) m.transparent = true;
        });
        this._lineMaterial.depthWrite = true;
        this._lineMaterial.depthTest = false;
        if (this._lineMaterial.opacity !== 1) this._lineMaterial.transparent = true;
    }

    /**
     * Finds a plane where to draw the shape.
     *
     * Earcut works best when the shape is along XY axis (i.e. horizontal),
     * so if the shape is vertical, we need to rotate it.
     * This takes care of finding a plane where we'll be able to project our shape on.
     *
     * Note: "best fitting" is pretentious. Finding the best fitting plane is a hard problem.
     * We are just finding a plane that is "fitting enough to have a decent triangulation".
     */
    private _findBestFittingPlane(): void {
        const nbPoints = this.coordinates.length / STRIDE3D;

        if (nbPoints > 3) {
            // Find bounding box of all our points
            tmpBox3.makeEmpty();
            tmpBox3.setFromArray(this.coordinates);
            tmpBox3.getSize(tmpVec3s[0]);
            tmpBox3.getCenter(this._center);

            // Find normal of the geometry based on the smallest dimension
            // of our bounding box
            if (tmpVec3s[0].x < tmpVec3s[0].y && tmpVec3s[0].x < tmpVec3s[0].z) {
                tmpVec3s[2].set(1, 0, 0);
            } else if (tmpVec3s[0].y < tmpVec3s[0].x && tmpVec3s[0].y < tmpVec3s[0].z) {
                tmpVec3s[2].set(0, 1, 0);
            } else {
                tmpVec3s[2].set(0, 0, 1);
            }

            // First point will be the center of the bounding box

            // Second point will be our first drawn point
            tmpVec3s[0]
                .set(
                    this.coordinates[0 * STRIDE3D + 0],
                    this.coordinates[0 * STRIDE3D + 1],
                    this.coordinates[0 * STRIDE3D + 2],
                )
                .sub(this._center);

            // Third point will be our second point rotated around our normal
            tmpVec3s[1].copy(tmpVec3s[0]).applyAxisAngle(tmpVec3s[2], Math.PI / 2);

            tmpVec3s[0].add(this._center);
            tmpVec3s[1].add(this._center);

            // Find plane based on those three points
            this._plane.setFromCoplanarPoints(this._center, tmpVec3s[0], tmpVec3s[1]);
        } else {
            // Take first point and consider the normal is up
            tmpVec3s[0].set(0, 0, 1);
            tmpVec3s[1].set(
                this.coordinates[0 * STRIDE3D + 0],
                this.coordinates[0 * STRIDE3D + 1],
                this.coordinates[0 * STRIDE3D + 2],
            );
            this._plane.setFromNormalAndCoplanarPoint(tmpVec3s[0], tmpVec3s[1]);
            this._center.copy(tmpVec3s[1]);
        }
        this._plane.normalize();

        if (!this._planeHelper) {
            this._planeHelper = new Mesh(planesGeom, this._planeHelperMaterial);
            this._planeHelper.name = 'planehelper';
        }

        // Our planeHelper will help us project points
        this._planeHelper.position.set(0, 0, 0);
        this._planeHelper.lookAt(this._plane.normal);
        this._planeHelper.position.copy(this._center);
        this._planeHelper.updateMatrixWorld(true);

        if (this._planeHelperVisible) {
            this.add(this._planeHelper);
            this.entity?.onObjectCreated(this._planeHelper);
        }

        // Compute how much we should extrude, as a fixed value will not work in all cases,
        // depending on how large the geometry is, resolution of our data, etc.
        this._extrudeDepth = this._minExtrudeDepth;
        for (let i = 0; i < nbPoints; i += 1) {
            tmpVec3s[0].set(
                this.coordinates[i * STRIDE3D + 0],
                this.coordinates[i * STRIDE3D + 1],
                this.coordinates[i * STRIDE3D + 2],
            );
            this._planeHelper.worldToLocal(tmpVec3s[0]);
            this._extrudeDepth = Math.max(this.extrudeDepth, tmpVec3s[0].z);
        }
        this._extrudeDepth = Math.min(this.extrudeDepth, this._maxExtrudeDepth);
    }

    /**
     * Computes and updates geometries for lines & polygons with new coordinates
     */
    private _computeExtrudedCoordinates(): void {
        const nbPoints = this.coordinates.length / STRIDE3D;

        // First we check if buffers are created, or need to be resized
        this._prepareBuffers();

        const sidesIndices = [];

        for (let i = 0; i < nbPoints; i += 1) {
            tmpVec3s[0].set(
                this.coordinates[i * STRIDE3D + 0],
                this.coordinates[i * STRIDE3D + 1],
                this.coordinates[i * STRIDE3D + 2],
            );
            // Earcut works best when the shape is along XY axis - see _findBestFittingPlane
            this._planeHelper.worldToLocal(tmpVec3s[0]);

            this._positionsTop[i * STRIDE3D + 0] = tmpVec3s[0].x;
            this._positionsTop[i * STRIDE3D + 1] = tmpVec3s[0].y;
            this._positionsTop[i * STRIDE3D + 2] = tmpVec3s[0].z + this.extrudeDepth;

            this._positionsBottom[i * STRIDE3D + 0] = tmpVec3s[0].x;
            this._positionsBottom[i * STRIDE3D + 1] = tmpVec3s[0].y;
            this._positionsBottom[i * STRIDE3D + 2] = tmpVec3s[0].z - this.extrudeDepth;

            this._positionsSide[i * STRIDE3D + 0] = tmpVec3s[0].x;
            this._positionsSide[i * STRIDE3D + 1] = tmpVec3s[0].y;
            this._positionsSide[i * STRIDE3D + 2] = tmpVec3s[0].z + this.extrudeDepth;

            this._positionsSide[(i + nbPoints) * STRIDE3D + 0] = tmpVec3s[0].x;
            this._positionsSide[(i + nbPoints) * STRIDE3D + 1] = tmpVec3s[0].y;
            this._positionsSide[(i + nbPoints) * STRIDE3D + 2] = tmpVec3s[0].z - this.extrudeDepth;

            if (i < nbPoints - 1) {
                // Simplified logic from PlaneGeometry constructor
                // to avoid creating new arrays & meshes each time
                const a = i;
                const b = i + nbPoints;
                const c = i + 1 + nbPoints;
                const d = i + 1;

                sidesIndices.push(a, b, d);
                sidesIndices.push(b, c, d);
            }
        }

        this._positionsTopBuffer.needsUpdate = true;
        this._positionsBottomBuffer.needsUpdate = true;
        this._positionsSideBuffer.needsUpdate = true;

        this._lineTopGeometry.setDrawRange(0, nbPoints);
        this._lineBottomGeometry.setDrawRange(0, nbPoints);

        this._sideGeometry.setIndex(sidesIndices);
        this._sideGeometry.computeVertexNormals();
    }

    /**
     * Computes and updates geometries for points (without extrusion)
     */
    private _computePointsCoordinates(): void {
        // First we check if buffers are created, or need to be resized
        this._prepareBuffers();
        this._positions.set(this.coordinates);
        this._positionsBuffer.needsUpdate = true;

        this._pointsGeometry.setDrawRange(0, this.coordinates.length / STRIDE3D);
    }

    /**
     * Draws points
     */
    private _drawPoints(): void {
        if (this._use3Dpoints) {
            // Render as Three.js objects
            this._computePointsCoordinates();
            this.add(this._points);
            this.entity?.onObjectCreated(this._points);
        } else {
            // Render via CSS2DRenderer
            const nbPoints = this.coordinates.length / STRIDE3D;
            const vec3 = new Vector3();
            for (let i = 0; i < nbPoints; i += 1) {
                vec3.set(
                    this.coordinates[i * STRIDE3D + 0],
                    this.coordinates[i * STRIDE3D + 1],
                    this.coordinates[i * STRIDE3D + 2],
                );

                const pt = this._point2DFactory(`${i + 1}`);
                const pt3d = new CSS2DObject(pt);
                pt3d.position.copy(vec3);
                pt3d.updateMatrixWorld();
                this.add(pt3d);
                this.entity?.onObjectCreated(pt3d);
            }
        }
    }

    /**
     * Draws a line/polyline
     */
    private _drawLine(): void {
        this._findBestFittingPlane();
        this._computeExtrudedCoordinates();

        [this._side, this._lineTop, this._lineBottom].forEach(o => {
            this.add(o);
            o.position.set(0, 0, 0);
            o.lookAt(this._plane.normal);
            o.position.copy(this._center);
            o.updateMatrix();
            o.updateMatrixWorld(true);
            this.entity?.onObjectCreated(o);
        });
    }

    /**
     * Draws a valid polygon
     */
    private _drawPolygon(): void {
        const nbPoints = this.coordinates.length / STRIDE3D;

        // Earcut does not work when the shape is not along XY axis (i.e. if vertical)
        // To prevent this, we:
        // 1. find a plane where our shape is flatish
        // 2. compute the coordinates of our shape relative to that plane
        // 3. earcut the coordinates
        // 4. draw the objects on that plane

        this._findBestFittingPlane();
        this._computeExtrudedCoordinates();

        this._surfaceTopGeometry.setIndex(
            Earcut(this._positionsTop.slice(0, (nbPoints - 1) * STRIDE3D), [], STRIDE3D),
        );
        this._surfaceBottomGeometry.setIndex(
            Earcut(this._positionsBottom.slice(0, (nbPoints - 1) * STRIDE3D), [], STRIDE3D),
        );

        [
            this._side, this._lineTop, this._lineBottom, this._surfaceTop, this._surfaceBottom,
        ].forEach(o => {
            this.add(o);
            o.position.set(0, 0, 0);
            o.lookAt(this._plane.normal);
            o.position.copy(this._center);
            o.updateMatrix();
            o.updateMatrixWorld(true);
            this.entity?.onObjectCreated(o);
        });
    }
}

export default Drawing;
