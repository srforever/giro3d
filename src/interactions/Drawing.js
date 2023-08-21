/**
 * @module interactions/Drawing
 */
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
    Material,
    Mesh,
    MeshBasicMaterial,
    Plane,
    PlaneGeometry,
    Vector3,
    PointsMaterial,
    Points,
} from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as olformat from 'ol/format.js';
import Instance from '../core/Instance.js';

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

const format = new olformat.GeoJSON();

const tmpVec3s = [new Vector3(), new Vector3(), new Vector3()];
const tmpBox3 = new Box3();

const STRIDE3D = 3;

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
 * @callback point2DFactory
 * @description
 * Method to create a HTML element for points for CSS2DObject
 * @param {number} index Index of the point to display
 * @param {Vector3} position Position of the point in world space
 * @returns {HTMLElement} HTML Element
 * @api
 */

/**
 * Simple geometry object for drawing.
 * Instanciated via DrawTool, but can also be added to Giro3D to view and edit simple geometries.
 *
 * @api
 */
class Drawing extends Group {
    /**
     * Creates a new 3D Object
     *
     * @param {Instance} instance Giro3D instance
     * @param {object} [options] Optional properties
     * @param {string} [options.name] Name for this shape
     * @param {number} [options.minExtrudeDepth=3] Minimum depth for the extrusion
     * @param {number} [options.maxExtrudeDepth=20] Maximum depth for the extrusion
     * @param {Material} [options.faceMaterial] Material to be used for faces
     * @param {Material} [options.sideMaterial] Material to be used for the extruded sides
     * @param {LineBasicMaterial} [options.lineMaterial] Material to be used for the borders
     * @param {PointsMaterial} [options.pointMaterial] Material to be used for the points (not used
     * if `use3Dpoints` is `false`)
     * @param {boolean} [options.use3Dpoints=true] Render points as 3D objects - if false, must
     * provide `point2DFactory` option
     * @param {point2DFactory} [options.point2DFactory]
     * Callback for creating DOM element for points for CSS2DObject - used only if `use3Dpoints`
     * is `false`)
     * @param {boolean} [options.planeHelperVisible=false] True to make the plane helper visible.
     * When drawing the shape, we project the points on a plane for triangulation. This enables
     * seeing the plane used for projecting while debugging.
     * @param {Material} options.planeHelperMaterial Material to be used for the plane helper
     * (if visible)
     * @param {number} [options.pointsBudget=100] Initial number of points to allocate when drawing
     * @param {object} [geojson] Initial GeoJSON shape
     */
    constructor(instance, options = {}, geojson = null) {
        super();
        this.name = options.name ?? 'drawobject';
        this.instance = instance;
        this.minExtrudeDepth = options.minExtrudeDepth ?? 1;
        this.maxExtrudeDepth = options.maxExtrudeDepth ?? 5;
        this.faceMaterial = options.faceMaterial ?? defaultFaceMaterial;
        this.sideMaterial = options.sideMaterial ?? defaultSideMaterial;
        this.lineMaterial = options.lineMaterial ?? defaultLineMaterial;
        this.pointMaterial = options.pointMaterial ?? defaultPointMaterial;
        this.use3Dpoints = options.use3Dpoints ?? true;
        this.point2DFactory = (
            options.point2DFactory !== null && options.point2DFactory !== undefined
        ) ? options.point2DFactory.bind(this) : this._defaultPoint2DFactory.bind(this);
        this.planeHelperMaterial = options.planeHelperMaterial ?? defaultPlaneHelperMaterial;
        this.planeHelperMaterial.depthTest = false;
        this.planeHelperMaterial.depthWrite = false;
        this.planeHelperVisible = options.planeHelperVisible ?? false;
        this.pointsBudget = options.pointsBudget ?? 100;

        if (typeof this.minExtrudeDepth !== 'number' || this.minExtrudeDepth < 0) {
            throw new Error('minExtrudeDepth should be a non-negative number');
        }
        if (typeof this.maxExtrudeDepth !== 'number' || this.maxExtrudeDepth < 0) {
            throw new Error('maxExtrudeDepth should be a non-negative number');
        }
        if (this.maxExtrudeDepth < this.minExtrudeDepth) {
            throw new Error('maxExtrudeDepth should be greater or equal to minExtrudeDepth');
        }
        if (typeof this.pointsBudget !== 'number' || this.pointsBudget <= 0) {
            throw new Error('pointsBudget should be a positive number');
        }

        this._doSanityChecksMaterials();

        this.plane = new Plane();
        this.center = new Vector3();

        if (geojson) {
            // Will allocate buffers with optimal size
            this.setGeojson(geojson);
        } else {
            // Don't allocate buffers yet, we'll allocate them when needed
            this.coordinates = [];
            this.geometryType = null;
        }
    }

    /**
     * Disposes of the object
     *
     * @api
     */
    dispose() {
        this.clear();
        this.instance = null;
    }

    /**
     *  Removes all child objects.
     */
    clear() {
        if (
            !this.use3Dpoints
            && (
                this.geometryType === GEOMETRY_TYPE.POINT
                || this.geometryType === GEOMETRY_TYPE.MULTIPOINT
            )
        ) {
            for (const o of this.children) {
                o.element.remove();
            }
        }
        return super.clear();
    }

    /**
     * Default Point2D factory for creating labels.
     *
     * @param {number} index Index of the point
     * @param {Vector3} position Position of the point
     * @returns {HTMLElement} DOM Element to attach to the CSS2DObject
     */
    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    _defaultPoint2DFactory(index, position) {
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
        pt.innerText = `${index + 1}`;
        return pt;
    }

    /**
     * Initializes buffers & geometries for drawing points
     *
     * @param {number} size Number of points to allocate
     */
    _initPointsBuffers(size) {
        this.positions = new Float32Array(size * STRIDE3D);
        this.positionsBuffer = new BufferAttribute(this.positions, STRIDE3D);

        this.pointsGeometry = new BufferGeometry();
        this.pointsGeometry.setAttribute('position', this.positionsBuffer);

        this.points = new Points(this.pointsGeometry, this.pointMaterial);
    }

    /**
     * Initializes buffers & geometries for drawing lines
     *
     * @param {number} size Number of points to allocate
     */
    _initLineBuffers(size) {
        this.positionsTop = new Float32Array(size * STRIDE3D);
        this.positionsTopBuffer = new BufferAttribute(this.positionsTop, STRIDE3D);

        this.positionsBottom = new Float32Array(size * STRIDE3D);
        this.positionsBottomBuffer = new BufferAttribute(this.positionsBottom, STRIDE3D);

        this.positionsSide = new Float32Array(size * 2 * STRIDE3D);
        this.positionsSideBuffer = new BufferAttribute(this.positionsSide, STRIDE3D);

        this.lineTopGeometry = new BufferGeometry();
        this.lineTopGeometry.setAttribute('position', this.positionsTopBuffer);

        this.lineBottomGeometry = new BufferGeometry();
        this.lineBottomGeometry.setAttribute('position', this.positionsBottomBuffer);

        this.sideGeometry = new BufferGeometry();
        this.sideGeometry.setAttribute('position', this.positionsSideBuffer);
        this.sideGeometry.setIndex([]);

        this.lineTop = new Line(this.lineTopGeometry, this.lineMaterial);
        this.lineTop.name = 'lineTop';
        this.lineTop.renderOrder = 1;
        this.lineBottom = new Line(this.lineBottomGeometry, this.lineMaterial);
        this.lineBottom.name = 'lineBottom';
        this.side = new Mesh(this.sideGeometry, this.sideMaterial);
        this.side.name = 'side';
    }

    /**
     * Initializes buffers & geometries for drawing polygons
     *
     * @param {number} size Number of points to allocate
     */
    _initPolygonBuffers(size) {
        this._initLineBuffers(size);

        this.surfaceTopGeometry = new BufferGeometry();
        this.surfaceTopGeometry.setAttribute('position', this.positionsTopBuffer);
        this.surfaceTopGeometry.setIndex([]);

        this.surfaceBottomGeometry = new BufferGeometry();
        this.surfaceBottomGeometry.setAttribute('position', this.positionsBottomBuffer);
        this.surfaceBottomGeometry.setIndex([]);

        this.surfaceTop = new Mesh(this.surfaceTopGeometry, this.faceMaterial);
        this.surfaceTop.name = 'surfaceTop';
        this.surfaceBottom = new Mesh(this.surfaceBottomGeometry, this.backfaceMaterial);
        this.surfaceBottom.name = 'surfaceBottom';
    }

    /**
     * Initializes or resizes buffers and geometries for current shape
     */
    _prepareBuffers() {
        const nbPoints = this.coordinates.length / STRIDE3D;

        // First we check if buffers are created, or need to be resized
        switch (this.geometryType) {
            case GEOMETRY_TYPE.POINT:
            case GEOMETRY_TYPE.MULTIPOINT:
                if (this.use3Dpoints) {
                    if (!this.points) {
                        this._initPointsBuffers(nbPoints);
                    } else if (this.positions.length < this.coordinates.length) {
                        // Need to resize the buffers & all
                        this._initPointsBuffers(
                            Math.max(
                                this.positions.length / STRIDE3D + this.pointsBudget,
                                nbPoints,
                            ),
                        );
                    }
                }
                break;

            case GEOMETRY_TYPE.LINE:
                if (!this.lineTop) {
                    this._initLineBuffers(nbPoints);
                } else if (this.positionsTop.length < this.coordinates.length) {
                    // Need to resize the buffers & all
                    this._initLineBuffers(
                        Math.max(
                            this.positionsTop.length / STRIDE3D + this.pointsBudget,
                            nbPoints,
                        ),
                    );
                }
                break;

            case GEOMETRY_TYPE.POLYGON:
                if (!this.surfaceTop) {
                    this._initPolygonBuffers(nbPoints);
                } else if (this.positionsTop.length < this.coordinates.length) {
                    // Need to resize the buffers & all
                    this._initPolygonBuffers(
                        Math.max(this.positionsTop.length / STRIDE3D + this.pointsBudget, nbPoints),
                    );
                }
                break;

            default:
                throw new Error(`Invalid geometry type ${this.geometryType}`);
        }
    }

    update() {
        this.setCoordinates(this.coordinates, this.geometryType);
    }

    /**
     * Sets the shape to draw.
     *
     * @param {object} geojson GeoJSON shape to draw
     * @api
     */
    setGeojson(geojson) {
        if (!geojson) return;

        const geometry = format
            .readFeature({
                type: 'Feature',
                geometry: geojson,
            })
            .getGeometry();
        this.setCoordinates(geometry.flatCoordinates, geometry.getType());
    }

    /**
     * Sets the shape to draw.
     *
     * @param {Array<number>} coordinates Array of flat coordinates
     * @param {GEOMETRY_TYPE} geometryType Type of geometry
     * @api
     */
    setCoordinates(coordinates, geometryType) {
        // Remove all children
        this.clear();

        const nbPoints = coordinates.length / STRIDE3D;

        if (nbPoints > 0) {
            this.geometryType = geometryType;

            switch (geometryType) {
                case GEOMETRY_TYPE.POINT:
                case GEOMETRY_TYPE.MULTIPOINT:
                    if (nbPoints < 1) {
                        // Not a point, do nothing
                        break;
                    }

                    this.coordinates = coordinates;
                    this._drawPoints();
                    break;

                case GEOMETRY_TYPE.LINE:
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

                    this.coordinates = coordinates;
                    this._drawLine();
                    break;

                case GEOMETRY_TYPE.POLYGON:
                    // Polygon is closed, so:
                    // - 2 points means there is only one "real" point,
                    // - 3 points means there are 2 "real" points

                    if (nbPoints < 3) {
                        // A single point is selected, do nothing
                        break;
                    }
                    if (nbPoints < 4) {
                        // Only two points are there, draw as a line
                        this.coordinates = coordinates.slice(0, -STRIDE3D);
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
                            this.coordinates = coordinates.slice(0, -2 * STRIDE3D);
                            this._drawLine();
                            break;
                        }
                    }
                    this.coordinates = coordinates;
                    this._drawPolygon();
                    break;

                default:
                    this.geometryType = null;
                    throw new Error(`Invalid geometry type ${geometryType}`);
            }
        } else {
            this.geometryType = null;
        }

        this.instance.notifyChange(this);
    }

    /**
     * Sets materials for this object
     *
     * @param {object} [materials] Optional materials
     * @param {?Material} materials.faceMaterial Material to be used for faces
     * @param {?Material} materials.sideMaterial Material to be used for the extruded sides
     * @param {?LineBasicMaterial} materials.lineMaterial Material to be used for the borders
     * @param {?PointsMaterial} materials.pointMaterial Material to be used for the points
     * @param {?Material} materials.planeHelperMaterial Material to be used for the plane helper
     * @api
     */
    setMaterials({
        faceMaterial, sideMaterial, lineMaterial, pointMaterial, planeHelperMaterial,
    }) {
        this.faceMaterial = faceMaterial ?? defaultFaceMaterial;
        this.sideMaterial = sideMaterial ?? defaultSideMaterial;
        this.lineMaterial = lineMaterial ?? defaultLineMaterial;
        this.pointMaterial = pointMaterial ?? defaultPointMaterial;
        this.planeHelperMaterial = planeHelperMaterial ?? defaultPlaneHelperMaterial;

        this._doSanityChecksMaterials();

        if (this.points) {
            this.points.material = this.pointMaterial;
        }
        if (this.lineTop) {
            this.lineTop.material = this.lineMaterial;
            this.lineBottom.material = this.lineMaterial;
        }
        if (this.surfaceTop) {
            this.surfaceTop.material = this.faceMaterial;
            this.surfaceBottom.material = this.backfaceMaterial;
        }
        if (this.side) {
            this.side.material = this.sideMaterial;
        }
        this.instance.notifyChange(this);
    }

    /**
     * Makes sure materials are correctly set for optimal display
     * (e.g. sides rendering & depth settings)
     */
    _doSanityChecksMaterials() {
        this.faceMaterial.side = FrontSide;
        this.backfaceMaterial = this.faceMaterial.clone();
        this.backfaceMaterial.side = BackSide;
        this.sideMaterial.side = DoubleSide;

        [this.faceMaterial, this.backfaceMaterial, this.sideMaterial].forEach(m => {
            m.depthWrite = false;
            if (m.opacity !== 1) m.transparent = true;
        });
        this.lineMaterial.depthWrite = true;
        this.lineMaterial.depthTest = false;
        if (this.lineMaterial.opacity !== 1) this.lineMaterial.transparent = true;
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
    _findBestFittingPlane() {
        const nbPoints = this.coordinates.length / STRIDE3D;

        if (nbPoints > 3) {
            // Find bounding box of all our points
            tmpBox3.makeEmpty();
            tmpBox3.setFromArray(this.coordinates);
            tmpBox3.getSize(tmpVec3s[0]);
            tmpBox3.getCenter(this.center);

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
                .sub(this.center);

            // Third point will be our second point rotated around our normal
            tmpVec3s[1].copy(tmpVec3s[0]).applyAxisAngle(tmpVec3s[2], Math.PI / 2);

            tmpVec3s[0].add(this.center);
            tmpVec3s[1].add(this.center);

            // Find plane based on those three points
            this.plane.setFromCoplanarPoints(this.center, tmpVec3s[0], tmpVec3s[1]);
        } else {
            // Take first point and consider the normal is up
            tmpVec3s[0].set(0, 0, 1);
            tmpVec3s[1].set(
                this.coordinates[0 * STRIDE3D + 0],
                this.coordinates[0 * STRIDE3D + 1],
                this.coordinates[0 * STRIDE3D + 2],
            );
            this.plane.setFromNormalAndCoplanarPoint(tmpVec3s[0], tmpVec3s[1]);
            this.center.copy(tmpVec3s[1]);
        }
        this.plane.normalize();

        if (!this.planeHelper) {
            this.planeHelper = new Mesh(planesGeom, this.planeHelperMaterial);
            this.planeHelper.name = 'planehelper';
        }

        // Our planeHelper will help us project points
        this.planeHelper.position.set(0, 0, 0);
        this.planeHelper.lookAt(this.plane.normal);
        this.planeHelper.position.copy(this.center);
        this.planeHelper.updateMatrixWorld(true);

        if (this.planeHelperVisible) this.add(this.planeHelper);

        // Compute how much we should extrude, as a fixed value will not work in all cases,
        // depending on how large the geometry is, resolution of our data, etc.
        this.extrudeDepth = this.minExtrudeDepth;
        for (let i = 0; i < nbPoints; i += 1) {
            tmpVec3s[0].set(
                this.coordinates[i * STRIDE3D + 0],
                this.coordinates[i * STRIDE3D + 1],
                this.coordinates[i * STRIDE3D + 2],
            );
            this.planeHelper.worldToLocal(tmpVec3s[0]);
            this.extrudeDepth = Math.max(this.extrudeDepth, tmpVec3s[0].z);
        }
        this.extrudeDepth = Math.min(this.extrudeDepth, this.maxExtrudeDepth);
    }

    /**
     * Computes and updates geometries for lines & polygons with new coordinates
     */
    _computeExtrudedCoordinates() {
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
            this.planeHelper.worldToLocal(tmpVec3s[0]);

            this.positionsTop[i * STRIDE3D + 0] = tmpVec3s[0].x;
            this.positionsTop[i * STRIDE3D + 1] = tmpVec3s[0].y;
            this.positionsTop[i * STRIDE3D + 2] = tmpVec3s[0].z + this.extrudeDepth;

            this.positionsBottom[i * STRIDE3D + 0] = tmpVec3s[0].x;
            this.positionsBottom[i * STRIDE3D + 1] = tmpVec3s[0].y;
            this.positionsBottom[i * STRIDE3D + 2] = tmpVec3s[0].z - this.extrudeDepth;

            this.positionsSide[i * STRIDE3D + 0] = tmpVec3s[0].x;
            this.positionsSide[i * STRIDE3D + 1] = tmpVec3s[0].y;
            this.positionsSide[i * STRIDE3D + 2] = tmpVec3s[0].z + this.extrudeDepth;

            this.positionsSide[(i + nbPoints) * STRIDE3D + 0] = tmpVec3s[0].x;
            this.positionsSide[(i + nbPoints) * STRIDE3D + 1] = tmpVec3s[0].y;
            this.positionsSide[(i + nbPoints) * STRIDE3D + 2] = tmpVec3s[0].z - this.extrudeDepth;

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

        this.positionsTopBuffer.needsUpdate = true;
        this.positionsBottomBuffer.needsUpdate = true;
        this.positionsSideBuffer.needsUpdate = true;

        this.lineTopGeometry.setDrawRange(0, nbPoints);
        this.lineBottomGeometry.setDrawRange(0, nbPoints);

        this.sideGeometry.setIndex(sidesIndices);
        this.sideGeometry.computeVertexNormals();
    }

    /**
     * Computes and updates geometries for points (without extrusion)
     */
    _computePointsCoordinates() {
        // First we check if buffers are created, or need to be resized
        this._prepareBuffers();
        this.positions.set(this.coordinates);
        this.positionsBuffer.needsUpdate = true;

        this.pointsGeometry.setDrawRange(0, this.coordinates.length / STRIDE3D);
    }

    /**
     * Draws points
     */
    _drawPoints() {
        if (this.use3Dpoints) {
            // Render as Three.js objects
            this._computePointsCoordinates();
            this.add(this.points);
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

                const pt = this.point2DFactory(i, vec3);
                const pt3d = new CSS2DObject(pt);
                pt3d.position.copy(vec3);
                pt3d.updateMatrixWorld();
                this.add(pt3d);
            }
        }
    }

    /**
     * Draws a line/polyline
     */
    _drawLine() {
        this._findBestFittingPlane();
        this._computeExtrudedCoordinates();

        [this.side, this.lineTop, this.lineBottom].forEach(o => {
            this.add(o);
            o.position.set(0, 0, 0);
            o.lookAt(this.plane.normal);
            o.position.copy(this.center);
            o.updateMatrix();
            o.updateMatrixWorld(true);
        });
    }

    /**
     * Draws a valid polygon
     */
    _drawPolygon() {
        const nbPoints = this.coordinates.length / STRIDE3D;

        // Earcut does not work when the shape is not along XY axis (i.e. if vertical)
        // To prevent this, we:
        // 1. find a plane where our shape is flatish
        // 2. compute the coordinates of our shape relative to that plane
        // 3. earcut the coordinates
        // 4. draw the objects on that plane

        this._findBestFittingPlane();
        this._computeExtrudedCoordinates();

        this.surfaceTopGeometry.setIndex(
            Earcut(this.positionsTop.slice(0, (nbPoints - 1) * STRIDE3D), [], STRIDE3D),
        );
        this.surfaceBottomGeometry.setIndex(
            Earcut(this.positionsBottom.slice(0, (nbPoints - 1) * STRIDE3D), [], STRIDE3D),
        );

        [
            this.side, this.lineTop, this.lineBottom, this.surfaceTop, this.surfaceBottom,
        ].forEach(o => {
            this.add(o);
            o.position.set(0, 0, 0);
            o.lookAt(this.plane.normal);
            o.position.copy(this.center);
            o.updateMatrix();
            o.updateMatrixWorld(true);
        });
    }
}

export default Drawing;
