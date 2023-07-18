/**
 * @module entities/AxisGrid
 */
import {
    MathUtils,
    Vector2,
    Vector3,
    Group,
    Camera,
    Color,
    LineBasicMaterial,
    BufferGeometry,
    LineSegments,
    Float32BufferAttribute,
    Object3D,
    Sphere,
} from 'three';

import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import Entity3D from './Entity3D.js';
import Extent from '../core/geographic/Extent.js';
import Context from '../core/Context.js';
import { UNIT, crsToUnit } from '../core/geographic/Coordinates';
import Helpers from '../helpers/Helpers.js';

const mod = MathUtils.euclideanModulo;

const UP = new Vector2(0, 1);
const RIGHT = new Vector2(1, 0);

const tmp = {
    position: new Vector3(),
    planeNormal: new Vector3(),
    edgeCenter: new Vector3(),
    sideCenter: new Vector3(),
    v2: new Vector2(),
    sphere: new Sphere(),
};

const DEFAULT_STYLE = {
    color: new Color('white'),
    fontSize: 10,
    numberFormat: new Intl.NumberFormat(),
};

/**
 * The grid step values.
 *
 * @typedef {object} Ticks
 * @property {number} x The tick distance on the x axis.
 * @property {number} y  The tick distance on the y axis.
 * @property {number} z  The tick distance on the z (vertical) axis.
 */

/**
 * The grid volume.
 *
 * @typedef {object} Volume
 * @property {Extent} extent The grid volume extent.
 * @property {number} floor  The elevation of the grid floor.
 * @property {number} ceiling  The elevation of the grid ceiling.
 */

/**
 * The grid formatting options.
 *
 * @typedef {object} Style
 * @property {Color} color The grid line and label colors.
 * @property {number} fontSize The fontsize, in points (pt).
 * @property {Intl.NumberFormat} numberFormat The number format for the labels.
 */

/**
 * Describes the starting point of the ticks.
 *
 * @enum
 * @api
 */
const TickOrigin = {
    /**
     * Graduations start at the bottom left corner of the grid.
     *
     * @api
     * @type {number}
     */
    Relative: 0,

    /**
     * Graduations are measured from the origin of the coordinate reference system (CRS). In other
     * words, ticks are coordinates.
     *
     * @api
     * @type {number}
     */
    Absolute: 1,
};

/**
 * Create a 3D axis grid. This is represented as a box volume where each side of the box is itself a
 * grid.
 *
 * @example
 * // Create a 200x200 meters extent
 * const extent = new Extent('EPSG:3857', -100, +100, -100, +100);
 *
 * // Create an AxisGrid on this extent, with the grid floor at zero meters,
 * // and the grid ceiling at 2500 meters.
 * //
 * // Display a tick (grid line), every 10 meters on the horizontal axes,
 * // and every 50 meters on the vertical axis.
 * const grid = new AxisGrid('axis-grid', {
 *   volume: {
 *       extent,
 *       floor: 0,
 *       ceiling: 2500,
 *   },
 *   ticks: {
 *       x: 10,
 *       y: 10,
 *       z: 50,
 *   },
 * });
 * @api
 */
class AxisGrid extends Entity3D {
    /**
     * Creates an instance of AxisGrid.
     *
     * @api
     * @param {string} id The unique identifier of this entity.
     * @param {object} options The options.
     * @param {Volume} options.volume The grid volume.
     * @param {TickOrigin} [options.origin=TickOrigin.Relative] The origin of the ticks.
     * @param {Ticks} [options.ticks] The distance between grid lines.
     * @param {Style} [options.style] The styling options.
     */
    constructor(id, options) {
        super(id, new Group());

        /**
         * Read-only flag to check if a given object is of type AxisGrid.
         *
         * @type {boolean}
         * @api
         */
        this.isAxisGrid = true;
        this.type = 'AxisGrid';

        /** @type {Group} */
        this.root = this.object3d;

        this.labelRoot = new Group();
        this.labelRoot.name = 'labels';
        /** @type {Array<CSS2DObject>} */
        this.labels = [];
        /** @type {Style} */
        this._style = options.style || DEFAULT_STYLE;
        this.root.add(this.labelRoot);
        /** @type {Array<HTMLElement>} */
        this.labelElements = [];
        /** @type {Sphere} */
        this.boundingSphere = new Sphere();
        this.boundingBoxCenter = new Vector3();

        if (!options.volume) {
            throw new Error('options.volume is undefined');
        }

        /** @property {Volume} volume the volume of this grid */
        this.volume = options.volume;
        this.ticks = options.ticks || { x: 100, y: 100, z: 100 };
        this._origin = options.origin || TickOrigin.Relative;

        const unit = crsToUnit(this.volume.extent.crs());
        switch (unit) {
            case UNIT.METER:
                this.unitSuffix = ' m';
                break;
            case UNIT.DEGREE:
                this.unitSuffix = ' °';
                break;
            default:
                this.unitSuffix = '';
                break;
        }

        const color = new Color(this.style.color || 'white');
        this.material = new LineBasicMaterial({ color });

        this._cameraForward = new Vector3();

        this._showFloorGrid = true;
        this._showCeilingGrid = true;
        this._showSideGrids = true;
        this.showHelpers = false;

        this.refresh();
    }

    updateOpacity() {
        const v = this.opacity;
        this.labelElements.forEach(l => { l.style.opacity = `${v}`; });

        const mat = this.material;
        mat.opacity = v;
        mat.transparent = v < 1.0;
        mat.needsUpdate = true;
    }

    /**
     * Gets or sets the style.
     * You will need to call {@link module:entities/AxisGrid~AxisGrid#refresh refresh()}
     * to recreate the grid.
     *
     * @type {Style}
     * @api
     */
    get style() {
        return this._style;
    }

    set style(v) {
        if (v === undefined || v === null) {
            throw new Error('cannot assign undefined/null style');
        }
        this._style = v;
    }

    /**
     * Gets or sets the volume.
     * You will need to call {@link module:entities/AxisGrid~AxisGrid#refresh refresh()}
     * to recreate the grid.
     *
     * @type {Volume}
     * @api
     */
    get volume() {
        return this._volume;
    }

    set volume(v) {
        if (v === undefined || v === null) {
            throw new Error('cannot assign undefined/null volume');
        }
        this._volume = v;
    }

    /**
     * Gets or sets the tick origin.
     * You will need to call {@link module:entities/AxisGrid~AxisGrid#refresh refresh()}
     * to recreate the grid.
     *
     * @api
     * @type {TickOrigin}
     */
    get origin() {
        return this._origin;
    }

    set origin(v) {
        if (v === undefined || v === null) {
            throw new Error('cannot assign undefined/null origin');
        }
        this._origin = v;
    }

    /**
     * Gets or sets the grid and label color.
     *
     * @api
     * @type {Color}
     */
    get color() {
        return this.style.color;
    }

    set color(color) {
        this.material.color = color;
        this.style.color = color;
        const cssColor = getCssColor(color);
        this.labelElements.forEach(l => { l.style.color = cssColor; });
    }

    /**
     * Shows or hides labels.
     *
     * @api
     * @type {boolean}
     */
    get showLabels() {
        return this.labelRoot.visible;
    }

    set showLabels(v) {
        if (v !== this.labelRoot.visible) {
            this.labelRoot.visible = v;
            this._updateLabelsVisibility(this._lastCamera);
        }
    }

    /**
     * Shows or hides the floor grid.
     *
     * @api
     * @type {boolean}
     */
    get showFloorGrid() {
        return this._showFloorGrid;
    }

    set showFloorGrid(v) {
        if (v !== this._showFloorGrid) {
            this._showFloorGrid = v;
            this.updateVisibility();
        }
    }

    /**
     * Shows or hides the ceiling grid.
     *
     * @api
     * @type {boolean}
     */
    get showCeilingGrid() {
        return this._showCeilingGrid;
    }

    set showCeilingGrid(v) {
        if (v !== this._showCeilingGrid) {
            this._showCeilingGrid = v;
            this.updateVisibility();
        }
    }

    /**
     * Shows or hides the side grids.
     *
     * @api
     * @type {boolean}
     */
    get showSideGrids() {
        return this._showSideGrids;
    }

    set showSideGrids(v) {
        if (v !== this._showSideGrids) {
            this._showSideGrids = v;
            this.updateVisibility();
        }
    }

    /**
     * Rebuilds the grid. This is necessary after changing the ticks, volume or origin.
     *
     * @api
     */
    refresh() {
        this.volume.extent.center(this.root.position);

        this._buildSides();
        this._buildLabels();

        this.root.updateMatrixWorld();

        this.boundingBox = this.volume.extent.toBox3(this.volume.floor, this.volume.ceiling);
        this.boundingBox.getBoundingSphere(this.boundingSphere);

        this.boundingBox.getCenter(this.boundingBoxCenter);

        this.updateVisibility();
    }

    removeLabels() {
        const children = [...this.labelRoot.children];
        children.forEach(c => c.removeFromParent());
        this.labelElements.forEach(elt => elt.remove());
        this.labelElements.length = 0;
    }

    updateVisibility() {
        super.updateVisibility();

        this._updateLabelsVisibility(this._lastCamera);
    }

    _buildLabels() {
        // Labels are displayed along each edge of the box volume.
        // There are 12 edges in a box, and those edges are linked to their two sides.

        const labelRoot = this.labelRoot;
        const labelElements = this.labelElements;
        const labels = this.labels;

        this.removeLabels();

        const numberFormat = this.style.numberFormat;
        const cssColor = getCssColor(this.style.color);
        const opacity = this.opacity;
        const fontSize = this.style.fontSize;

        function createLabel(lx, ly, lz, text) {
            const label = new CSS2DObject(createLabelElement(text, cssColor, opacity, fontSize));
            labels.push(label);
            label.name = text;
            labelElements.push(label.element);
            label.position.set(lx, ly, lz);
            return label;
        }

        const v = new Vector3();
        const origin = this.volume.extent.center().xyz();

        /**
         *
         *
         * @param {Object3D} side1 The first shared side of this edge.
         * @param {Object3D} side2 The second shared side of this edge.
         * @param {Vector3} start  The position, in world space, of the start of the edge.
         * @param {Vector3} end The position, in world space, of the end of the edge.
         * @param {number} startValue The numerical value of the starting point.
         * @param {string} prefix The prefix to apply to the label text.
         * @param {string} suffix The suffix to apply to the label text.
         * @param {number} tick The distance between each tick.
         */
        function createLabelsAlongEdge(side1, side2, start, end, startValue, prefix, suffix, tick) {
            const g = new Group();
            g.name = `${side1.name}-${side2.name}`;
            g.side1 = side1;
            g.side2 = side2;
            g.isEdge = true;
            const edgeCenter = v.lerpVectors(start, end, 0.5).clone();
            edgeCenter.sub(origin);
            g.position.copy(edgeCenter);

            const sideLength = start.distanceTo(end);
            const step = tick / sideLength;
            let labelDistance = 0;

            let t = (tick - mod(startValue + tick, tick)) / sideLength;

            // Distribute the labels along the edge, on each tick
            do {
                v.lerpVectors(start, end, t);
                labelDistance = v.distanceTo(start);

                const rawValue = startValue + labelDistance;
                const labelValue = numberFormat.format(Math.round(rawValue));
                const text = `${prefix}${labelValue}${suffix}`;

                const label = createLabel(
                    v.x - edgeCenter.x - origin.x,
                    v.y - edgeCenter.y - origin.y,
                    v.z - edgeCenter.z - origin.z,
                    text,
                );

                g.add(label);

                t += step;
            } while (t <= 1);

            labelRoot.add(g);
        }

        const e = this.volume.extent;

        const zmax = this.volume.ceiling;
        const zmin = this.volume.floor;

        const br = e.bottomRight().xyz();
        const tr = e.topRight().xyz();
        const bl = e.bottomLeft().xyz();
        const tl = e.topLeft().xyz();

        const tlFloor = new Vector3(tl.x, tl.y, zmin);
        const trFloor = new Vector3(tr.x, tr.y, zmin);
        const brFloor = new Vector3(br.x, br.y, zmin);
        const blFloor = new Vector3(bl.x, bl.y, zmin);

        const tlCeil = new Vector3(tl.x, tl.y, zmax);
        const trCeil = new Vector3(tr.x, tr.y, zmax);
        const brCeil = new Vector3(br.x, br.y, zmax);
        const blCeil = new Vector3(bl.x, bl.y, zmax);

        const floor = this._floor;
        const ceil = this._ceiling;
        const front = this._front;
        const back = this._back;
        const left = this._left;
        const right = this._right;

        const relative = this.origin === TickOrigin.Relative;

        const bry = relative ? 0 : br.y;
        const blx = relative ? 0 : bl.x;
        const tlx = relative ? 0 : tl.x;
        const yPrefix = relative ? '' : 'y: ';
        const xPrefix = relative ? '' : 'x: ';
        const zPrefix = '';
        const hSuffix = relative ? this.unitSuffix : '';
        const vSuffix = this.unitSuffix;

        // floor edges
        createLabelsAlongEdge(floor, right, brFloor, trFloor, bry, yPrefix, hSuffix, this.ticks.y);
        createLabelsAlongEdge(floor, left, blFloor, tlFloor, bry, yPrefix, hSuffix, this.ticks.y);
        createLabelsAlongEdge(floor, front, blFloor, brFloor, blx, xPrefix, hSuffix, this.ticks.x);
        createLabelsAlongEdge(floor, back, tlFloor, trFloor, tlx, xPrefix, hSuffix, this.ticks.x);

        // ceiling edges
        createLabelsAlongEdge(ceil, right, brCeil, trCeil, bry, yPrefix, hSuffix, this.ticks.y);
        createLabelsAlongEdge(ceil, left, blCeil, tlCeil, bry, yPrefix, hSuffix, this.ticks.y);
        createLabelsAlongEdge(ceil, front, blCeil, brCeil, blx, xPrefix, hSuffix, this.ticks.x);
        createLabelsAlongEdge(ceil, back, tlCeil, trCeil, tlx, xPrefix, hSuffix, this.ticks.x);

        // vertical (elevation) edges
        createLabelsAlongEdge(front, right, brFloor, brCeil, zmin, zPrefix, vSuffix, this.ticks.z);
        createLabelsAlongEdge(front, left, blFloor, blCeil, zmin, zPrefix, vSuffix, this.ticks.z);
        createLabelsAlongEdge(back, left, tlFloor, tlCeil, zmin, zPrefix, vSuffix, this.ticks.z);
        createLabelsAlongEdge(back, right, trFloor, trCeil, zmin, zPrefix, vSuffix, this.ticks.z);
    }

    _deleteSides() {
        const root = this.root;

        function remove(obj) {
            if (obj) {
                obj.geometry.dispose();
                root.remove(obj);
            }
        }

        remove(this._floor);
        remove(this._ceiling);
        remove(this._front);
        remove(this._back);
        remove(this._left);
        remove(this._right);
    }

    _buildSides() {
        this.dimensions = this.volume.extent.dimensions();
        this.height = Math.abs(this.volume.ceiling - this.volume.floor);
        this.midHeight = this.volume.floor + this.height / 2;

        const x = this.dimensions.x;
        const y = this.dimensions.y;
        const z = this.height;
        const mat = this.material;

        const extent = this.volume.extent;

        const relative = this.origin === TickOrigin.Relative;

        const xStart = relative ? 0 : (this.ticks.x - (mod(extent.west(), this.ticks.x)));
        const yStart = relative ? 0 : (this.ticks.y - (mod(extent.south(), this.ticks.y)));
        const zStart = this.ticks.z - (mod(this.volume.floor, this.ticks.z));

        this._deleteSides();

        this._floor = this._buildSide('floor', x, y, xStart, this.ticks.x, yStart, this.ticks.y, mat);
        this._ceiling = this._buildSide('ceiling', x, y, xStart, this.ticks.x, yStart, this.ticks.y, mat);

        this._front = this._buildSide('front', x, z, xStart, this.ticks.x, zStart, this.ticks.z, mat);
        this._back = this._buildSide('back', x, z, xStart, this.ticks.x, zStart, this.ticks.z, mat);

        this._left = this._buildSide('left', y, z, yStart, this.ticks.y, zStart, this.ticks.z, mat);
        this._right = this._buildSide('right', y, z, yStart, this.ticks.y, zStart, this.ticks.z, mat);

        // Since the root group is located at the extent's center,
        // all subsequent transformations are local to this point.
        this._front.rotateX(MathUtils.degToRad(90));
        this._front.position.set(0, -this.dimensions.y / 2, this.midHeight);

        this._back.scale.setZ(-1);
        this._back.rotateX(MathUtils.degToRad(90));
        this._back.position.set(0, +this.dimensions.y / 2, this.midHeight);

        this._right.rotateX(MathUtils.degToRad(90));
        this._right.rotateY(MathUtils.degToRad(90));
        this._right.position.set(+this.dimensions.x / 2, 0, this.midHeight);

        this._left.scale.setZ(-1);
        this._left.rotateX(MathUtils.degToRad(90));
        this._left.rotateY(MathUtils.degToRad(90));
        this._left.position.set(-this.dimensions.x / 2, 0, this.midHeight);

        this._ceiling.position.set(0, 0, this.volume.ceiling);

        this._floor.position.set(0, 0, this.volume.floor);
        this._floor.scale.setZ(-1);

        this.root.add(this._back);
        this.root.add(this._left);
        this.root.add(this._right);
        this.root.add(this._front);
        this.root.add(this._floor);
        this.root.add(this._ceiling);
    }

    /**
     * @param {string} name The name of the object.
     * @param {number} width The width of the plane.
     * @param {number} height The height of the plane.
     * @param {number} xOffset The starting offset on the X axis.
     * @param {number} xStep The distance between lines on the X axis.
     * @param {number} yOffset The starting offset on the Y axis.
     * @param {number} yStep The distance between lines on the Y axis.
     * @returns {LineSegments} the mesh object.
     */
    _buildSide(
        name,
        width,
        height,
        xOffset,
        xStep,
        yOffset,
        yStep,
    ) {
        const vertices = [];
        const centerX = width / 2;
        const centerY = height / 2;
        let x = xOffset;
        let y = yOffset;

        const top = height;
        const bottom = 0;
        const left = 0;
        const right = width;

        function pushSegment(x0, y0, x1, y1) {
            vertices.push(x0 - centerX, y0 - centerY, 0);
            vertices.push(x1 - centerX, y1 - centerY, 0);
        }

        // Vertical boundary lines
        pushSegment(left, bottom, left, top);
        pushSegment(right, bottom, right, top);

        // Horizontal boundary lines
        pushSegment(left, bottom, right, bottom);
        pushSegment(left, top, right, top);

        // Horizontal subdivisions
        while (x <= right) {
            pushSegment(x, bottom, x, top);
            x += xStep;
        }

        // Vertical subdivisions
        while (y <= top) {
            pushSegment(left, y, right, y);
            y += yStep;
        }

        const geometry = new BufferGeometry();

        geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));

        const mesh = new LineSegments(geometry, this.material);

        mesh.name = name;

        return mesh;
    }

    _makeArrowHelper(start, end) {
        if (!this.arrowRoot) {
            this.arrowRoot = new Group();
            this.root.parent.add(this.arrowRoot);
        }

        const arrow = Helpers.createArrow(start.clone(), end.clone());
        this.arrowRoot.add(arrow);
        arrow.updateMatrixWorld();

        const startPoint = Helpers.createAxes(250);
        startPoint.position.copy(start);
        this.arrowRoot.add(startPoint);
        startPoint.updateMatrixWorld(true);

        const endPoint = Helpers.createAxes(250);
        endPoint.position.copy(end);
        this.arrowRoot.add(endPoint);
        endPoint.updateMatrixWorld(true);
    }

    /**
     * @param {Camera} camera The camera.
     */
    _updateLabelsVisibility(camera) {
        this._lastCamera = camera;

        this._deleteArrowHelpers();

        this.labelRoot.children.forEach(edge => this._updateLabelEdgeVisibility(camera, edge));
    }

    _deleteArrowHelpers() {
        if (__DEBUG__) {
            if (this.arrowRoot) {
                const children = [...this.arrowRoot.children];
                for (const child of children) {
                    child.removeFromParent();
                }
            }
        }
    }

    /**
     * @param {Camera} camera The camera.
     * @param {Group} edge The label edge.
     */
    _updateLabelEdgeVisibility(camera, edge) {
        if (!edge.isEdge) {
            return;
        }

        const rootVisible = this.object3d.visible && this.labelRoot.visible;
        const fontSize = this.style.fontSize;

        // Labels on an edge should be displayed only if one of their side is visible,
        // to prevent labels getting in the way.
        //
        // However, since the API enables overriding ceiling, floor or side grids visibility,
        // we must distinguish between the logical visibility of the side (aka computed from the
        // camera angle), and the final visibility, that also includes the API overrides.
        //
        // Note: HTML labels are not automatically hidden when their parent is hidden, because
        // they are not really part of the scene graph, so they must be updated accordingly.
        //
        const logicalVisibility = edge.side1.logicalVisibility !== edge.side2.logicalVisibility;
        const graphicalVisibility = edge.side1.visible || edge.side2.visible;
        const visible = logicalVisibility && graphicalVisibility && rootVisible;
        edge.visible = visible;

        let paddingTop = 0;
        let paddingBottom = 0;
        let paddingRight = 0;
        let paddingLeft = 0;

        if (visible) {
            // Now that we know this label edge is visible, we can compute the
            // offset to apply (in the form of padding) to the labels so they don't overlap
            // their edge line (for greater readability). We want to push the labels "outside"
            // the grid. Since labels are 2D elements in the DOM, we cannot simply move
            // the 3D objects around.
            //
            // To compute the vertical and horizontal paddings for the label in an edge,
            // we must first compute the vector from the center of the grid volume toward the center
            // of the label edge.
            //
            // Then project this vector on the screen, so that we can reason in the same
            // coordinate system than the DOM.
            //
            // Then we can establish a quadrant to know the padding. For example, if the vector
            // is pointing to the lower left corner of the screen, we know that the label must
            // be pushed in this direction, so that we apply padding accordingly.

            tmp.edgeCenter.set(0, 0, 0);
            const edgeCenter = edge.localToWorld(tmp.edgeCenter);

            const boxCenter = this.boundingBoxCenter.clone();

            if (__DEBUG__) {
                if (this.showHelpers) {
                    this._makeArrowHelper(boxCenter, edgeCenter);
                }
            }

            edgeCenter.project(camera);
            boxCenter.project(camera);

            const clipVector = edgeCenter.sub(boxCenter);
            // Our screenvector is in clip space, which is still a 3D space
            // We need a purely screen-space vector.
            const screenVector = tmp.v2.set(clipVector.x, clipVector.y).normalize();

            const vQuadrant = UP.dot(screenVector);
            const hQuadrant = RIGHT.dot(screenVector);

            const zero = 0;
            const limit = 0;
            const yMargin = fontSize * 2;
            const xMargin = fontSize * 0.7; // per character

            if (vQuadrant > limit) {
                paddingBottom = yMargin;
                paddingTop = zero;
            } else {
                paddingBottom = zero;
                paddingTop = yMargin;
            }

            if (hQuadrant > limit) {
                paddingLeft = xMargin;
                paddingRight = zero;
            } else {
                paddingLeft = zero;
                paddingRight = xMargin;
            }
        }

        const showHelpers = this.showHelpers;

        edge.traverse(c => {
            if (c.element) {
                c.visible = visible;
                if (visible) {
                    /** @type {CSSStyleDeclaration} */
                    const style = c.element.style;
                    style.paddingTop = `${paddingTop}pt`;
                    style.paddingBottom = `${paddingBottom}pt`;
                    const charCount = c.element.innerText.length;
                    style.paddingRight = `${paddingRight * charCount}pt`;
                    style.paddingLeft = `${paddingLeft * charCount}pt`;
                    if (__DEBUG__) {
                        style.backgroundColor = showHelpers ? 'rgba(0, 255, 0, 0.2)' : 'transparent';
                    }
                }
            }
        });
    }

    _updateSidesVisibility(camera) {
        function updateSideVisibility(side, sideVisibility, cameraNormal) {
            tmp.planeNormal.setFromMatrixColumn(side.matrixWorld, 2);
            // The reason why we distinguish between two kinds of visibility is because
            // label visibility rules must take into account the fact that the API
            // allowse to manually hide the ceiling, floor, or side grids.
            // Without that, we would have labels displayed when they should not.
            side.logicalVisibility = cameraNormal.dot(tmp.planeNormal) < -0.1;
            side.visible = sideVisibility && side.logicalVisibility;
        }

        // Only display sides that are facing toward the camera
        updateSideVisibility(this._front, this._showSideGrids, this._cameraForward);
        updateSideVisibility(this._back, this._showSideGrids, this._cameraForward);
        updateSideVisibility(this._right, this._showSideGrids, this._cameraForward);
        updateSideVisibility(this._left, this._showSideGrids, this._cameraForward);
        updateSideVisibility(this._ceiling, this._showCeilingGrid, this._cameraForward);
        updateSideVisibility(this._floor, this._showFloorGrid, this._cameraForward);

        this._updateLabelsVisibility(camera);
    }

    preUpdate(context) {
        /** @type {Camera} */
        const camera = context.camera.camera3D;

        this._cameraForward.setFromMatrixColumn(camera.matrixWorld, 2);

        this._updateSidesVisibility(camera);

        this._updateMinMaxDistance(context);

        return [];
    }

    /**
     * @param {Context} context The update context.
     */
    _updateMinMaxDistance(context) {
        const cameraPos = context.camera.camera3D.position;

        const centerDistance = this.boundingSphere.center.distanceTo(cameraPos);
        const radius = this.boundingSphere.radius;

        this._distance.min = centerDistance - radius;
        this._distance.max = centerDistance + radius;
    }

    dispose() {
        if (this._disposed) {
            return;
        }

        this._disposed = true;
        this.material.dispose();
        this._deleteSides();
        this.labelElements.forEach(elt => elt.remove());
        this.labelElements.length = 0;

        this._deleteArrowHelpers();
    }
}

function getCssColor(color) {
    return `#${color.getHexString()}`;
}

function createLabelElement(text, color, opacity, fontSize) {
    const div = document.createElement('div');

    // Static properties
    div.style.textAlign = 'center';
    div.style.verticalAlign = 'middle';
    div.style.textShadow = 'black 0 0 3px';

    // Dynamic properties
    div.innerText = text;

    // API exposed properties
    div.style.opacity = opacity;
    div.style.color = color;
    div.style.fontSize = `${fontSize}pt`;

    return div;
}

export { TickOrigin };

export default AxisGrid;
