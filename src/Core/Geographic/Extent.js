/**
 * @module Core/Geographic/Extent
 */
import {
    Box3,
    MathUtils,
    Vector2,
    Vector3,
    Vector4,
} from 'three';
import Coordinates, {
    crsIsGeographic, assertCrsIsValid, reasonnableEpsilonForCRS, is4326,
} from './Coordinates.js';

/**
 * Extent is a SIG-area (so 2D)
 * It can use explicit coordinates (e.g: lon/lat) or implicit (WMTS coordinates)
 */

function YToWGS84(y) {
    return MathUtils.radToDeg(
        2 * (Math.atan(Math.exp(-(y - 0.5) * Math.PI * 2)) - Math.PI / 4),
    );
}

const CARDINAL = {
    WEST: 0,
    EAST: 1,
    SOUTH: 2,
    NORTH: 3,
};

function _isTiledCRS(crs) {
    return crs.indexOf('WMTS:') === 0
        || crs === 'TMS';
}

/**
 * An object representing a spatial extent. It encapsulates a Coordinate Reference System id (CRS)
 * and coordinates.
 *
 * It leverages [proj4js](https://github.com/proj4js/proj4js) to do the heavy-lifting of defining
 * and transforming coordinates between reference systems. As a consequence, every EPSG code known
 * by proj4js can be used out of the box, as such:
 *
 *     // an extent defined by bottom-left longitude 0 and latitude 0 and top-right longitude 1 and
 *     // latitude 1
 *     const extent = new Extent('EPSG:4326', 0, 0, 1, 1);
 *
 * For other EPSG codes, you must register them with
 * {@link module:Core/Instance~Instance.registerCRS Instance.registerCRS()} :
 *
 *     Instance.registerCRS('EPSG:3946',
            '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 + \
            ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
 *     extent = new Extent(
 *                  'EPSG:3946',
 *                  1837816.94334, 1847692.32501,
 *                  5170036.4587, 5178412.82698);
 *
 * @api
 */
class Extent {
    /**
     * Constructs an Extent object.
     *
     * @param {string} crs The CRS code the coordinates are expressed in. Every EPSG code known by
     * [proj4js](https://github.com/proj4js/proj4js) can be used directly.
     * For others, you must manually register them.
     * Please refer to [proj4js](https://github.com/proj4js/proj4js) doc for more information.
     * @param {number|object|Coordinates} values Variable number of arguments. The following
     * combinations are supported:
     * - 2 {@link module:Core/Geographic/Coordinates Coordinates}
     * (one representing the min coords, another containing the max coords)
     * - an object with `west`, `east`, `south`, `north` properties
     * - an array of the form `[minx, maxx, miny, maxy]`
     */
    constructor(crs, ...values) {
        this._crs = crs;

        if (_isTiledCRS(crs)) {
            if (values.length === 3) {
                [this.zoom, this.row, this.col] = values;

                if (this.zoom < 0) {
                    throw new Error(`invlid WTMS values ${values}`);
                }
            } else {
                throw new Error(`Unsupported constructor args '${values}'`);
            }
        } else if (values.length === 2
            && values[0] instanceof Coordinates
            && values[1] instanceof Coordinates) {
            this._values = new Float64Array(4);
            [this._values[CARDINAL.WEST], this._values[CARDINAL.SOUTH]] = values[0]._values;
            [this._values[CARDINAL.EAST], this._values[CARDINAL.NORTH]] = values[1]._values;
        } else if (values.length === 1 && values[0].west !== undefined) {
            this._values = new Float64Array(4);
            this._values[CARDINAL.WEST] = values[0].west;
            this._values[CARDINAL.EAST] = values[0].east;
            this._values[CARDINAL.SOUTH] = values[0].south;
            this._values[CARDINAL.NORTH] = values[0].north;
        } else if (values.length === 4) {
            this._values = new Float64Array(4);
            Object.keys(CARDINAL).forEach(key => {
                const cardinal = CARDINAL[key];
                this._values[cardinal] = values[cardinal];
            });
        } else {
            throw new Error(`Unsupported constructor args '${values}'`);
        }
    }

    /**
     * Clones this object.
     *
     * @api
     * @returns {Extent} a copy of this object.
     */
    clone() {
        if (_isTiledCRS(this._crs)) {
            return new Extent(this._crs, this.zoom, this.row, this.col);
        }
        const result = new Extent(this._crs, ...this._values);
        return result;
    }

    /**
     * Returns an extent with a relative margin added.
     *
     * @param {number} marginRatio The margin, in normalized value ([0, 1]).
     * A margin of 1 means 100% of the width or height of the extent.
     * @example
     * const extent = new Extent('EPSG:3857', 0, 100, 0, 100);
     * const margin = extent.withRelativeMargin(0.1);
     * //  new Extent('EPSG:3857', -10, 110, -10, 110);
     * @api
     * @returns {Extent} a new extent with a specified margin applied.
     */
    withRelativeMargin(marginRatio) {
        const w = Math.abs(this.west() - this.east());
        const h = Math.abs(this.north() - this.south());

        return this.withMargin(marginRatio * w, marginRatio * h);
    }

    /**
     * Returns an extent with a margin.
     *
     * @param {number} x The horizontal margin, in CRS units.
     * @param {number} y The vertical margin, in CRS units.
     * @example
     * const extent = new Extent('EPSG:3857', 0, 100, 0, 100);
     * const margin = extent.withMargin(10, 15);
     * //  new Extent('EPSG:3857', -10, 110, -15, 115);
     * @api
     * @returns {Extent} a new extent with a specified margin applied.
     */
    withMargin(x, y) {
        const w = this.west() - x;
        const e = this.east() + x;
        const n = this.north() + y;
        const s = this.south() - y;

        return new Extent(this.crs(), w, e, s, n);
    }

    /**
     * Converts this extent into another CRS.
     * If `crs` is the same as the current CRS, the original object is returned.
     *
     * @api
     * @param {string} crs the new CRS
     * @returns {Extent} the converted extent.
     */
    as(crs) {
        assertCrsIsValid(crs);

        if (_isTiledCRS(this._crs)) {
            if (this._crs === 'WMTS:PM') {
            // Convert this to the requested crs by using 4326 as an intermediate state.
                const nbCol = 2 ** this.zoom;
                const size = 360 / nbCol;
                // convert column PM to longitude EPSG:4326 degree
                const west = 180 - size * (nbCol - this.col);
                const east = 180 - size * (nbCol - (this.col + 1));
                const nbRow = nbCol;
                const sizeRow = 1.0 / nbRow;
                // convert row PM to Y PM
                const Yn = 1 - sizeRow * (nbRow - (this.row));
                const Ys = 1 - sizeRow * (nbRow - (this.row + 1));
                // convert Y PM to latitude EPSG:4326 degree
                const north = YToWGS84(Yn);
                const south = YToWGS84(Ys);
                // create intermediate EPSG:4326 and convert in new crs
                return new Extent('EPSG:4326', {
                    west, east, south, north,
                }).as(crs);
            }
            if (this._crs === 'WMTS:WGS84G' && crs === 'EPSG:4326') {
                const nbRow = 2 ** this.zoom;
                const size = 180 / nbRow;
                const north = size * (nbRow - this.row) - 90;
                const south = size * (nbRow - (this.row + 1)) - 90;
                const west = 180 - size * (2 * nbRow - this.col);
                const east = 180 - size * (2 * nbRow - (this.col + 1));

                return new Extent(crs, {
                    west, east, south, north,
                });
            }
            throw new Error('Unsupported yet');
        }

        if (this._crs !== crs && !(is4326(this._crs) && is4326(crs))) {
        // Compute min/max in x/y by projecting 8 cardinal points,
        // and then taking the min/max of each coordinates.
            const cardinals = [];
            const c = this.center();
            cardinals.push(new Coordinates(this._crs, this.west(), this.north()));
            cardinals.push(new Coordinates(this._crs, c._values[0], this.north()));
            cardinals.push(new Coordinates(this._crs, this.east(), this.north()));
            cardinals.push(new Coordinates(this._crs, this.east(), c._values[1]));
            cardinals.push(new Coordinates(this._crs, this.east(), this.south()));
            cardinals.push(new Coordinates(this._crs, c._values[0], this.south()));
            cardinals.push(new Coordinates(this._crs, this.west(), this.south()));
            cardinals.push(new Coordinates(this._crs, this.west(), c._values[1]));

            let north = -Infinity;
            let south = Infinity;
            let east = -Infinity;
            let west = Infinity;
            // loop over the coordinates
            for (let i = 0; i < cardinals.length; i++) {
            // convert the coordinate.
                cardinals[i] = cardinals[i].as(crs);
                north = Math.max(north, cardinals[i]._values[1]);
                south = Math.min(south, cardinals[i]._values[1]);
                east = Math.max(east, cardinals[i]._values[0]);
                west = Math.min(west, cardinals[i]._values[0]);
            }
            return new Extent(crs, {
                north, south, east, west,
            });
        }

        return this;
    }

    offsetToParent(other, target = new Vector4()) {
        if (this.crs() !== other.crs()) {
            throw new Error('unsupported mix');
        }
        if (_isTiledCRS(this.crs())) {
            const diffLevel = this.zoom - other.zoom;
            const diff = 2 ** diffLevel;
            const invDiff = 1 / diff;

            const r = (this.row - (this.row % diff)) * invDiff;
            const c = (this.col - (this.col % diff)) * invDiff;

            return target.set(
                this.col * invDiff - c,
                this.row * invDiff - r,
                invDiff, invDiff,
            );
        }

        const oDim = other.dimensions();
        const dim = this.dimensions();

        const originX = Math.round((1000 * (this.west() - other.west())) / oDim.x) * 0.001;
        const originY = Math.round((1000 * (this.south() - other.south())) / oDim.y) * 0.001;

        const scaleX = Math.round((1000 * dim.x) / oDim.x) * 0.001;
        const scaleY = Math.round((1000 * dim.y) / oDim.y) * 0.001;

        return target.set(originX, originY, scaleX, scaleY);
    }

    /**
     * @api
     * @returns {number} the horizontal coordinate of the westernmost side
     */
    west() {
        return this._values[CARDINAL.WEST];
    }

    /**
     * @api
     * @returns {number} the horizontal coordinate of the easternmost side
     */
    east() {
        return this._values[CARDINAL.EAST];
    }

    /**
     * @api
     * @returns {number} the horizontal coordinate of the northernmost side
     */
    north() {
        return this._values[CARDINAL.NORTH];
    }

    /**
     * @api
     * @returns {number} the horizontal coordinate of the southermost side
     */
    south() {
        return this._values[CARDINAL.SOUTH];
    }

    /**
     * Gets the coordinate reference system of this extent.
     *
     * @api
     * @returns {string} the coordinate reference system of this object
     */
    crs() {
        return this._crs;
    }

    /**
     * Sets `target` with the center of this extent.
     *
     * @api
     * @param {object|Vector2} target the object to set with the center's X.
     * If none provided, a new one is created.
     * @param {number} target.x the `x` component
     * @param {number} target.y the `y` component
     * @returns {object|Vector2} the modified object passed in argument.
     */
    center(target) {
        if (_isTiledCRS(this._crs)) {
            throw new Error('Invalid operation for WMTS bbox');
        }
        let c;
        if (target) {
            if (target instanceof Coordinates) {
                Coordinates.call(target, this._crs, this._values[0], this._values[2]);
            }
            c = target;
        } else {
            c = new Coordinates(this._crs, this._values[0], this._values[2]);
        }
        const dim = this.dimensions();
        if (c instanceof Coordinates) {
            c._values[0] += dim.x * 0.5;
            c._values[1] += dim.y * 0.5;
        } else {
            c.x = this._values[0] + dim.x * 0.5;
            c.y = this._values[2] + dim.y * 0.5;
        }
        return c;
    }

    /**
     * Sets the target with the width and height of this extent.
     * The <code>x</code> property will be set with the width,
     * and the <code>y</code> property will be set with the height.
     *
     * @api
     * @param {object|Vector2} [target] the optional object to set with the width.
     * @returns {object|Vector2} the modified object passed in argument,
     * or a new object if none was provided.
     */
    dimensions(target) {
        target = target || { x: 0, y: 0 };
        target.x = Math.abs(this.east() - this.west());
        target.y = Math.abs(this.north() - this.south());
        return target;
    }

    /**
     * Checks whether the specified coordinate is inside this extent.
     *
     * @api
     * @param {Coordinates} coord the coordinate to test
     * @param {number} [epsilon=0] the precision delta (+/- epsilon)
     * @returns {boolean} true if the coordinate is inside the bounding box
     */
    isPointInside(coord, epsilon = 0) {
        const c = (this.crs() === coord.crs) ? coord : coord.as(this.crs());
        // TODO this ignores altitude
        if (crsIsGeographic(this.crs())) {
            return c.longitude() <= this.east() + epsilon
               && c.longitude() >= this.west() - epsilon
               && c.latitude() <= this.north() + epsilon
               && c.latitude() >= this.south() - epsilon;
        }
        return c.x() <= this.east() + epsilon
               && c.x() >= this.west() - epsilon
               && c.y() <= this.north() + epsilon
               && c.y() >= this.south() - epsilon;
    }

    /**
     * Tests whether this extent is contained in another extent.
     *
     * @api
     * @param {Extent} other the other extent to test
     * @param {number} [epsilon=null] the precision delta (+/- epsilon).
     * If this value is not provided, a reasonable epsilon will be computed.
     * @returns {boolean} true if this extent is contained in the other extent.
     */
    isInside(other, epsilon) {
        const o = other.as(this._crs);
        // 0 is an acceptable value for epsilon:
        epsilon = epsilon == null ? reasonnableEpsilonForCRS(this._crs, this) : epsilon;
        return this.east() - o.east() <= epsilon
               && o.west() - this.west() <= epsilon
               && this.north() - o.north() <= epsilon
               && o.south() - this.south() <= epsilon;
    }

    /**
     * Returns true if this bounding box intersect with the bouding box parameter
     *
     * @api
     * @param {Extent} bbox the bounding box to test
     * @returns {boolean} true if this bounding box intersects with the provided bounding box
     */
    intersectsExtent(bbox) {
        const other = bbox.as(this.crs());
        return !(this.west() >= other.east()
             || this.east() <= other.west()
             || this.south() >= other.north()
             || this.north() <= other.south());
    }

    /**
     * Set this extent to the intersection of itself and other
     *
     * @api
     * @param {Extent} other the bounding box to intersect
     * @returns {Extent} the modified extent
     */
    intersect(other) {
        if (!this.intersectsExtent(other)) {
            this.set(this.crs(), 0, 0, 0, 0);
            return this;
        }
        // TODO use an intermediate tmp instance for .as
        if (other.crs() !== this.crs()) {
            other = other.as(this.crs());
        }
        this.set(this.crs(),
            Math.max(this.west(), other.west()),
            Math.min(this.east(), other.east()),
            Math.max(this.south(), other.south()),
            Math.min(this.north(), other.north()));

        return this;
    }

    /**
     * Set the coordinate reference system and values of this
     * extent.
     *
     * @api
     * @param {*} crs the new CRS
     * @param  {...any} values the new values
     * @returns {Extent} this object modified
     */
    set(crs, ...values) {
        this._crs = crs;
        if (_isTiledCRS(this.crs())) {
            [this.zoom, this.row, this.col] = values;
        } else {
            Object.keys(CARDINAL).forEach(key => {
                const cardinal = CARDINAL[key];
                this._values[cardinal] = values[cardinal];
            });
        }
        return this;
    }

    copy(other) {
        this._crs = other.crs();
        if (_isTiledCRS(this.crs())) {
            this.zoom = other.zoom;
            this.row = other.row;
            this.col = other.col;
        } else {
            Object.keys(CARDINAL).forEach(key => {
                const cardinal = CARDINAL[key];
                this._values[cardinal] = other._values[cardinal];
            });
        }
        return this;
    }

    union(extent) {
        if (extent.crs() !== this.crs()) {
            throw new Error('unsupported union between 2 diff crs');
        }
        const west = extent.west();
        if (west < this.west()) {
            this._values[CARDINAL.WEST] = west;
        }

        const east = extent.east();
        if (east > this.east()) {
            this._values[CARDINAL.EAST] = east;
        }

        const south = extent.south();
        if (south < this.south()) {
            this._values[CARDINAL.SOUTH] = south;
        }

        const north = extent.north();
        if (north > this.north()) {
            this._values[CARDINAL.NORTH] = north;
        }
    }

    /**
     * Expands the extent to contain the specified coordinates.
     *
     * @api
     * @param {Coordinates} coordinates The coordinates to include
     */
    expandByPoint(coordinates) {
        const coords = coordinates.as(this.crs());
        const we = coords._values[0];
        if (we < this.west()) {
            this._values[CARDINAL.WEST] = we;
        }
        if (we > this.east()) {
            this._values[CARDINAL.EAST] = we;
        }
        const sn = coords._values[1];
        if (sn < this.south()) {
            this._values[CARDINAL.SOUTH] = sn;
        }
        if (sn > this.north()) {
            this._values[CARDINAL.NORTH] = sn;
        }
    }

    /**
     * Moves the extent by the provided <code>x</code> and <code>y</code> values.
     *
     * @api
     * @param {number} x the horizontal shift
     * @param {number} y the vertical shift
     * @returns {Extent} the modified extents.
     */
    shift(x, y) {
        this._values[CARDINAL.WEST] += x;
        this._values[CARDINAL.EAST] += x;
        this._values[CARDINAL.SOUTH] += y;
        this._values[CARDINAL.NORTH] += y;
        return this;
    }

    /**
     * Constructs an extent from the specified box.
     *
     * @api
     * @static
     * @param {string} crs the coordinate reference system of the new extent.
     * @param {object} box the box to read values from
     * @param {object} box.min the lower left corner of the box
     * @param {number} box.min.x the x value of the lower left corner of the box
     * @param {number} box.min.y the y value of the lower left corner of the box
     * @param {object} box.max the upper right corner of the box
     * @param {number} box.max.x the x value of the upper right corner of the box
     * @param {number} box.max.y the y value of the upper right corner of the box
     * @returns {Extent} the constructed extent.
     */
    static fromBox3(crs, box) {
        return new this(crs, {
            west: box.min.x,
            east: box.max.x,
            south: box.min.y,
            north: box.max.y,
        });
    }

    /**
     * Returns a [Box3](https://threejs.org/docs/?q=box3#api/en/math/Box3) that matches this extent.
     *
     * @param {number} minHeight The min height of the box.
     * @param {number} maxHeight The max height of the box.
     * @api
     * @returns {Box3} The box.
     */
    toBox3(minHeight, maxHeight) {
        const min = new Vector3(this.west(), this.south(), minHeight);
        const max = new Vector3(this.east(), this.north(), maxHeight);
        const box = new Box3(min, max);
        return box;
    }

    /**
     * Subdivides this extents into x and y subdivisions.
     *
     * Notes:
     * - Subdivisions must be strictly positive.
     * - If both subvisions are `1`, an array of one element is returned,
     *  containing a copy of this extent.
     *
     * @api
     * @param {number} xSubdivs The number of subdivisions on the X/longitude axis.
     * @param {number} ySubdivs The number of subdivisions on the Y/latitude axis.
     * @returns {Extent[]} the resulting extents.
     * @example
     * const extent = new Extent('EPSG:3857', 0, 100, 0, 100);
     * extent.split(2, 1);
     * // [0, 50, 0, 50], [50, 100, 50, 100]
     */
    split(xSubdivs, ySubdivs) {
        if (xSubdivs < 1 || ySubdivs < 1) {
            throw new Error('Invalid subdivisions. Must be strictly positive.');
        }

        if (xSubdivs === 1 && ySubdivs === 1) {
            return [this.clone()];
        }

        const dims = this.dimensions();
        const minX = this.west();
        const minY = this.south();
        const w = dims.x / xSubdivs;
        const h = dims.y / ySubdivs;
        const crs = this.crs();

        const result = [];

        for (let x = 0; x < xSubdivs; x++) {
            for (let y = 0; y < ySubdivs; y++) {
                const west = minX + x * w;
                const south = minY + y * h;
                const east = west + w;
                const north = south + h;
                const extent = new Extent(crs, west, east, south, north);
                result.push(extent);
            }
        }

        return result;
    }
}

export default Extent;
