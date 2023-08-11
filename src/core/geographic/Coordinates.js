/**
 * @module core/geographic/Coordinates
 */
import { Vector2, Vector3, MathUtils } from 'three';
import proj4 from 'proj4';

const projectionCache = {};

export const UNIT = {
    DEGREE: 1,
    METER: 2,
};

/**
 * Returns the enum value of the specified unit of measure
 *
 * @param {string} projunit the proj4 UoM string
 * @returns {number} the unit of measure (see <code>UNIT</code>)
 * @private
 */
function _unitFromProj4Unit(projunit) {
    if (projunit === 'degrees') {
        return UNIT.DEGREE;
    }
    if (projunit === 'm') {
        return UNIT.METER;
    }
    return undefined;
}

/**
 * Returns the unit of measure (UoM) of the specified CRS
 *
 * @param {string} crs the CRS to test
 * @returns {number} the unit of measure (see <code>UNIT</code>)
 */
export function crsToUnit(crs) {
    switch (crs) {
        case 'EPSG:4326': return UNIT.DEGREE;
        case 'EPSG:4978': return UNIT.METER;
        default: {
            const p = proj4.defs(crs);
            if (!p) {
                return undefined;
            }
            return _unitFromProj4Unit(p.units);
        }
    }
}

export function reasonnableEpsilonForCRS(crs, extent) {
    if (is4326(crs)) {
        return 0.01;
    }
    const d = extent.dimensions();
    return 0.01 * Math.min(d.x, d.y);
}

function _crsToUnitWithError(crs) {
    const u = crsToUnit(crs);
    if (crs === undefined || u === undefined) {
        throw new Error(`Invalid crs parameter value '${crs}'`);
    }
    return u;
}

export function assertCrsIsValid(crs) {
    if (!proj4.defs[crs]) {
        throw new Error(`Invalid crs parameter value '${crs}'. Did you define it with proj4?`);
    }
}

/**
 * Tests whether the CRS is in geographic coordinates.
 *
 * @param {string} crs the CRS to test
 * @returns {boolean} <code>true</code> if the CRS is in geographic coordinates.
 */
export function crsIsGeographic(crs) {
    return (_crsToUnitWithError(crs) !== UNIT.METER);
}

/**
 * Tests whether the CRS is in geocentric coordinates.
 *
 * @param {string} crs the CRS to test
 * @returns {boolean} <code>true</code> if the CRS is in geocentric coordinates.
 */
export function crsIsGeocentric(crs) {
    return (_crsToUnitWithError(crs) === UNIT.METER);
}

function _assertIsGeographic(crs) {
    if (!crsIsGeographic(crs)) {
        throw new Error(`Can't query crs ${crs} long/lat`);
    }
}

function _assertIsGeocentric(crs) {
    if (!crsIsGeocentric(crs)) {
        throw new Error(`Can't query crs ${crs} x/y/z`);
    }
}

function instanceProj4(crsIn, crsOut) {
    if (projectionCache[crsIn]) {
        const p = projectionCache[crsIn];
        if (p[crsOut]) {
            return p[crsOut];
        }
    } else {
        projectionCache[crsIn] = {};
    }
    const p = proj4(crsIn, crsOut);
    projectionCache[crsIn][crsOut] = p;
    return p;
}

export function is4326(crs) {
    return crs.indexOf('EPSG:4326') === 0;
}

const planarNormal = new Vector3(0, 0, 1);

/**
 * Represents coordinates associated with a coordinate reference system (CRS).
 *
 * @api
 */
class Coordinates {
    /**
     * Build a {@link Coordinates} object, given a [CRS](http://inspire.ec.europa.eu/theme/rs) and a number of coordinates value.
     * Coordinates can be geocentric, geographic, or an instance of [Vector3](https://threejs.org/docs/#api/math/Vector3).
     * - If <code>crs</code> is <code>'EPSG:4326'</code>, coordinates must be in [geographic system](https://en.wikipedia.org/wiki/Geographic_coordinate_system).
     * - If <code>crs</code> is <code>'EPSG:4978'</code>, coordinates must be in [geocentric system](https://en.wikipedia.org/wiki/Earth-centered,_Earth-fixed_coordinate_system).
     *
     * @api
     * @param       {string} crs Geographic or Geocentric coordinates system.
     * @param       {[number, number, number]|Vector3} coordinates The coordinates.
     * @example
     * new Coordinates('EPSG:4978', 20885167, 849862, 23385912); //Geocentric coordinates
     * // or
     * new Coordinates('EPSG:4326', 2.33, 48.24, 24999549); //Geographic coordinates
     */
    constructor(crs, ...coordinates) {
        this._values = new Float64Array(3);
        this.set(crs, ...coordinates);
    }

    /**
     * Returns the normal vector associated with this coordinate.
     *
     * @returns {Vector3} The normal vector.
     * @api
     */
    // eslint-disable-next-line class-methods-use-this
    get geodesicNormal() {
        return planarNormal;
    }

    set(crs, ...coordinates) {
        _crsToUnitWithError(crs);
        this.crs = crs;

        if (coordinates.length === 1 && coordinates[0] instanceof Vector3) {
            this._values[0] = coordinates[0].x;
            this._values[1] = coordinates[0].y;
            this._values[2] = coordinates[0].z;
        } else {
            for (let i = 0; i < coordinates.length && i < 3; i++) {
                this._values[i] = coordinates[i];
            }
            for (let i = coordinates.length; i < 3; i++) {
                this._values[i] = 0;
            }
        }
        this._normal = undefined;
        return this;
    }

    clone(target) {
        let r;
        if (target) {
            Coordinates.call(target, this.crs, ...this._values);
            r = target;
        } else {
            r = new Coordinates(this.crs, ...this._values);
        }
        if (this._normal) {
            r._normal = this._normal.clone();
        }
        return r;
    }

    copy(src) {
        this.set(src.crs, ...src._values);
        return this;
    }

    /**
     * Returns the longitude in geographic coordinates.
     * Coordinates must be in geographic system (can be
     * converted by using {@linkcode module:Core/geographic/Coordinates~Coordinates#as as()} ).
     *
     * @example
     * const position = { longitude: 2.33, latitude: 48.24, altitude: 24999549 };
     * const coordinates = new Coordinates(
     *   'EPSG:4326', position.longitude, position.latitude, position.altitude); // Geographic
     * coordinates.longitude(); // Longitude in geographic system
     * // returns 2.33
     *
     * // or
     *
     * const position = { x: 20885167, y: 849862, z: 23385912 };
     * // Geocentric system
     * const coords = new Coordinates('EPSG:4978', position.x, position.y, position.z);
     * const coordinates = coords.as('EPSG:4326');  // Geographic system
     * coordinates.longitude(); // Longitude in geographic system
     * // returns 2.330201911389028
     * @returns     {number} - The longitude of the position.
     * @api
     */
    longitude() {
        _assertIsGeographic(this.crs);
        return this._values[0];
    }

    /**
     * Returns the latitude in geographic coordinates.
     * Coordinates must be in geographic system (can be
     * converted by using {@linkcode module:Core/geographic/Coordinates~Coordinates#as as()} ).
     *
     * @example
     *
     * const position = { longitude: 2.33, latitude: 48.24, altitude: 24999549 };
     * const coordinates = new Coordinates(
     *     'EPSG:4326', position.longitude, position.latitude, position.altitude); // Geographic
     * coordinates.latitude(); // Latitude in geographic system
     * // returns : 48.24
     *
     * // or
     *
     * const position = { x: 20885167, y: 849862, z: 23385912 };
     * // Geocentric system
     * const coords = new Coordinates('EPSG:4978', position.x, position.y, position.z);
     * const coordinates = coords.as('EPSG:4326');  // Geographic system
     * coordinates.latitude(); // Latitude in geographic system
     * // returns : 48.24830764643365
     * @returns     {number} - The latitude of the position.
     * @api
     */
    latitude() {
        return this._values[1];
    }

    /**
     * Returns the altitude in geographic coordinates.
     * Coordinates must be in geographic system(can be converted by using
     * {@linkcode module:Core/geographic/Coordinates~Coordinates#as as()} ).
     *
     * @example
     *
     * const position = { longitude: 2.33, latitude: 48.24, altitude: 24999549 };
     * // Geographic system
     * const coordinates =
     *      new Coordinates('EPSG:4326', position.longitude, position.latitude, position.altitude);
     * coordinates.altitude(); // Altitude in geographic system
     * // returns : 24999549
     *
     * // or
     *
     * const position = { x: 20885167, y: 849862, z: 23385912 };
     * // Geocentric system
     * const coords = new Coordinates('EPSG:4978', position.x, position.y, position.z);
     * const coordinates = coords.as('EPSG:4326');  // Geographic system
     * coordinates.altitude(); // Altitude in geographic system
     * // returns : 24999548.046711832
     * @returns     {number} - The altitude of the position.
     * @api
     */
    altitude() {
        _assertIsGeographic(this.crs);
        return this._values[2];
    }

    /**
     * Set the altitude.
     *
     * @param      {number} altitude the new altitude.
     * @example coordinates.setAltitude(10000)
     * @api
     */
    setAltitude(altitude) {
        _assertIsGeographic(this.crs);
        this._values[2] = altitude;
    }

    /**
     * Returns the <code>x</code> component of this coordinate in geocentric coordinates.
     * Coordinates must be in geocentric system (can be
     * converted by using {@linkcode module:Core/geographic/Coordinates~Coordinates#as as()}).
     *
     * @example
     *
     * const position = { x: 20885167, y: 849862, z: 23385912 };
     * const coordinates = new Coordinates('EPSG:4978', position.x, position.y, position.z);
     * coordinates.x();  // Geocentric system
     * // returns : 20885167
     *
     * // or
     *
     * const position = { longitude: 2.33, latitude: 48.24, altitude: 24999549 };
     * // Geographic system
     * const coords =
     *     new Coordinates('EPSG:4326', position.longitude, position.latitude, position.altitude);
     * const coordinates = coords.as('EPSG:4978'); // Geocentric system
     * coordinates.x(); // Geocentric system
     * // returns : 20888561.0301258
     * @returns {number} The <code>x</code> component of the position.
     * @api
     */
    x() {
        _assertIsGeocentric(this.crs);
        return this._values[0];
    }

    /**
     * Returns the <code>y</code> component of this coordinate in geocentric coordinates.
     * Coordinates must be in geocentric system (can be
     * converted by using {@linkcode module:Core/geographic/Coordinates~Coordinates#as as()}).
     *
     * @example
     * const position = { x: 20885167, y: 849862, z: 23385912 };
     * const coordinates = new Coordinates('EPSG:4978', position.x, position.y, position.z);
     * coordinates.y();  // Geocentric system
     * // returns :  849862
     * @returns {number} The <code>y</code> component of the position.
     * @api
     */
    y() {
        _assertIsGeocentric(this.crs);
        return this._values[1];
    }

    /**
     * Returns the <code>z</code> component of this coordinate in geocentric coordinates.
     * Coordinates must be in geocentric system (can be
     * converted by using {@linkcode module:Core/geographic/Coordinates~Coordinates#as as()}).
     *
     * @example
     * const position = { x: 20885167, y: 849862, z: 23385912 };
     * const coordinates = new Coordinates('EPSG:4978', position.x, position.y, position.z);
     * coordinates.z();  // Geocentric system
     * // returns :  23385912
     * @returns {number} The <code>z</code> component of the position.
     * @api
     */
    z() {
        _assertIsGeocentric(this.crs);
        return this._values[2];
    }

    /**
     * Returns a position in cartesian coordinates. Coordinates must be in geocentric system (can be
     * converted by using {@linkcode module:Core/geographic/Coordinates~Coordinates#as as()}).
     *
     * @example
     *
     * const position = { x: 20885167, y: 849862, z: 23385912 };
     * // Geocentric system
     * const coordinates = new Coordinates('EPSG:4978', position.x, position.y, position.z);
     * coordinates.xyz();  // Geocentric system
     * // returns : Vector3
     * // x: 20885167
     * // y: 849862
     * // z: 23385912
     *
     * // or
     *
     * const position = { longitude: 2.33, latitude: 48.24, altitude: 24999549 };
     * // Geographic system
     * const coords =
     *      new Coordinates('EPSG:4326', position.longitude, position.latitude, position.altitude);
     * const coordinates = coords.as('EPSG:4978'); // Geocentric system
     * coordinates.xyz(); // Geocentric system
     * // returns : Vector3
     * // x: 20885167
     * // y: 849862
     * // z: 23385912
     * @param {Vector3} [target] the geocentric coordinate
     * @returns     {Vector3} target position
     * @api
     */
    xyz(target) {
        _assertIsGeocentric(this.crs);
        const v = target || new Vector3();
        v.fromArray(this._values);
        return v;
    }

    /**
     * Converts coordinates in another [CRS](http://inspire.ec.europa.eu/theme/rs).
     *
     * If target is not specified, creates a new instance.
     * The original instance is never modified (except if you passed it as `target`).
     *
     * @example
     *
     * const position = { longitude: 2.33, latitude: 48.24, altitude: 24999549 };
     * // Geographic system
     * const coords =
     *     new Coordinates('EPSG:4326', position.longitude, position.latitude, position.altitude);
     * const coordinates = coords.as('EPSG:4978'); // Geocentric system
     * @param   {string} crs the [CRS](http://inspire.ec.europa.eu/theme/rs) EPSG string
     * @param   {Coordinates|Vector3} [target] the object that is returned
     * @returns {Coordinates|Vector3} the converted coordinate
     * @api
     */
    as(crs, target) {
        if (crs === undefined || crsToUnit(crs) === undefined) {
            throw new Error(`Invalid crs paramater value '${crs}'`);
        }
        return this._convert(crs, target);
    }

    // Only support explicit conversions
    _convert(newCrs, target) {
        target = target || new Coordinates(newCrs, 0, 0, 0);
        if (newCrs === this.crs) {
            return target.copy(this);
        }
        if (this.crs in proj4.defs && newCrs in proj4.defs) {
            const val0 = this._values[0];
            let val1 = this._values[1];
            const crsIn = this.crs;

            // there is a bug for converting anything from and to 4978 with proj4
            // https://github.com/proj4js/proj4js/issues/195
            // the workaround is to use an intermediate projection, like EPSG:4326
            if (is4326(crsIn) && newCrs === 'EPSG:3857') {
                val1 = MathUtils.clamp(val1, -89.999999, 89.999999);
                const p = instanceProj4(crsIn, newCrs).forward([val0, val1]);
                return target.set(newCrs, p[0], p[1], this._values[2]);
            }
            // here is the normal case with proj4
            const p = instanceProj4(crsIn, newCrs).forward([val0, val1]);
            return target.set(newCrs, p[0], p[1], this._values[2]);
        }

        throw new Error(`Cannot convert from crs ${this.crs} to ${newCrs}`);
    }

    /**
     * Returns the normalized offset from bottom-left in extent of this Coordinates
     * e.g:
     * ```
     * extent.center().offsetInExtent(extent)
     * ```
     *  would return `(0.5, 0.5)`.
     *
     * @param {module:Core/geographic/Extent~Extent} extent the extent to test
     * @param {Vector2} target optional Vector2 target.
     * If not present a new one will be created
     * @returns {Vector2} normalized offset in extent
     * @api
     */
    offsetInExtent(extent, target) {
        if (this.crs !== extent.crs()) {
            throw new Error('unsupported mix');
        }

        const dimX = Math.abs(extent.east() - extent.west());
        const dimY = Math.abs(extent.north() - extent.south());

        const x = crsIsGeocentric(this.crs) ? this.x() : this.longitude();
        const y = crsIsGeocentric(this.crs) ? this.y() : this.latitude();

        const originX = (x - extent.west()) / dimX;
        const originY = (y - extent.south()) / dimY;

        target = target || new Vector2();
        target.set(originX, originY);
        return target;
    }

    /**
     * Returns the boolean result of the check if this coordinate is geographic (true)
     * or geocentric (false).
     *
     * @example
     * const position = { x: 20885167, y: 849862, z: 23385912 };
     * const coordinates = new Coordinates('EPSG:4978', position.x, position.y, position.z);
     * coordinates.isGeographic();  // Geocentric system
     * // returns :  false
     * @returns {boolean} If the coordinate is geographic.
     * @api
     */
    isGeographic() {
        return crsIsGeographic(this.crs);
    }
}

export const C = {

    /**
     * Returns a Coordinates object from a position object in the EPSG:4326 CRS.
     * The object just* needs to have x, y, z properties.
     *
     * @param {object} args the position to transform
     * @param {number} args.x the x component of the position
     * @param {number} args.y the y component of the position
     * @param {number} args.z the z component of the position
     * @returns {Coordinates} the created coordinates
     */
    EPSG_4326: function EPSG_4326(...args) {
        return new Coordinates('EPSG:4326', ...args);
    },
};

export default Coordinates;
