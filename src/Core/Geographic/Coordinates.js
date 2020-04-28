/**
 * Generated On: 2015-10-5
 * Class: Coordinates
 * Description: Coordonnées cartographiques
 */

import * as THREE from 'three';
import proj4 from 'proj4';

const projectionCache = {};

export const UNIT = {
    DEGREE: 1,
    METER: 2,
};

function _unitFromProj4Unit(projunit) {
    if (projunit === 'degrees') {
        return UNIT.DEGREE;
    } else if (projunit === 'm') {
        return UNIT.METER;
    }
    return undefined;
}

export function crsToUnit(crs) {
    switch (crs) {
        case 'EPSG:4326' : return UNIT.DEGREE;
        case 'EPSG:4978' : return UNIT.METER;
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

export function crsIsGeographic(crs) {
    return (_crsToUnitWithError(crs) !== UNIT.METER);
}

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

// Only support explicit conversions
function _convert(coordsIn, newCrs, target) {
    target = target || new Coordinates(newCrs, 0, 0);
    if (newCrs === coordsIn.crs) {
        return target.copy(coordsIn);
    }
    if (coordsIn.crs in proj4.defs && newCrs in proj4.defs) {
        const val0 = coordsIn._values[0];
        let val1 = coordsIn._values[1];
        const crsIn = coordsIn.crs;

        // there is a bug for converting anything from and to 4978 with proj4
        // https://github.com/proj4js/proj4js/issues/195
        // the workaround is to use an intermediate projection, like EPSG:4326
        if (is4326(crsIn) && newCrs === 'EPSG:3857') {
            val1 = THREE.Math.clamp(val1, -89.999999, 89.999999);
            const p = instanceProj4(crsIn, newCrs).forward([val0, val1]);
            return target.set(newCrs, p[0], p[1], coordsIn._values[2]);
        }
        // here is the normal case with proj4
        const p = instanceProj4(crsIn, newCrs).forward([val0, val1]);
        return target.set(newCrs, p[0], p[1], coordsIn._values[2]);
    }

    throw new Error(`Cannot convert from crs ${coordsIn.crs} to ${newCrs}`);
}

/**
 * Build a Coordinates object, given a {@link http://inspire.ec.europa.eu/theme/rs|crs} and a number of coordinates value. Coordinates can be in geocentric system, geographic system or an instance of {@link https://threejs.org/docs/#api/math/Vector3|THREE.Vector3}.
 * If crs = 'EPSG:4326', coordinates must be in geographic system.
 * If crs = 'EPSG:4978', coordinates must be in geocentric system.
 * @constructor
 * @param       {string} crs - Geographic or Geocentric coordinates system.
 * @param       {number|THREE.Vector3} coordinates - The globe coordinates to aim to.
 * @param       {number} coordinates.longitude - Geographic Coordinate longitude
 * @param       {number} coordinates.latitude - Geographic Coordinate latitude
 * @param       {number} coordinates.altitude - Geographic Coordinate altiude
 * @param       {number} coordinates.x - Geocentric Coordinate X
 * @param       {number} coordinates.y - Geocentric Coordinate Y
 * @param       {number} coordinates.z - Geocentric Coordinate Z
 * @example
 * new Coordinates('EPSG:4978', 20885167, 849862, 23385912); //Geocentric coordinates
 * // or
 * new Coordinates('EPSG:4326', 2.33, 48.24, 24999549); //Geographic coordinates
 */
const planarNormal = new THREE.Vector3(0, 0, 1);

function Coordinates(crs, ...coordinates) {
    this._values = new Float64Array(3);
    this.set(crs, ...coordinates);

    Object.defineProperty(this, 'geodesicNormal',
        {
            configurable: true,
            get: () => planarNormal,
        });
}

Coordinates.prototype.set = function set(crs, ...coordinates) {
    _crsToUnitWithError(crs);
    this.crs = crs;

    if (coordinates.length === 1 && coordinates[0] instanceof THREE.Vector3) {
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
};

Coordinates.prototype.clone = function clone(target) {
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
};

Coordinates.prototype.copy = function copy(src) {
    this.set(src.crs, ...src._values);
    return this;
};

/**
 * Returns the longitude in geographic coordinates. Coordinates must be in geographic system (can be
 * converted by using {@linkcode as()} ).
 * @example
 *
 * const position = { longitude: 2.33, latitude: 48.24, altitude: 24999549 };
 * const coordinates = new Coordinates(
 *   'EPSG:4326', position.longitude, position.latitude, position.altitude); // Geographic system
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
 *
 * @return     {number} - The longitude of the position.
 */

Coordinates.prototype.longitude = function longitude() {
    _assertIsGeographic(this.crs);
    return this._values[0];
};

/**
 * Returns the latitude in geographic coordinates. Coordinates must be in geographic system (can be
 * converted by using {@linkcode as()} ).
 * @example
 *
 * const position = { longitude: 2.33, latitude: 48.24, altitude: 24999549 };
 * const coordinates = new Coordinates(
 *     'EPSG:4326', position.longitude, position.latitude, position.altitude); // Geographic system
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
 *
 * @return     {number} - The latitude of the position.
 */

Coordinates.prototype.latitude = function latitude() {
    return this._values[1];
};

/**
 * Returns the altitude in geographic coordinates. Coordinates must be in geographic system (can be
 * converted by using {@linkcode as()} ).
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
 *
 * @return     {number} - The altitude of the position.
 */

Coordinates.prototype.altitude = function altitude() {
    _assertIsGeographic(this.crs);
    return this._values[2];
};

/**
 * Set the altiude.
 * @example coordinates.setAltitude(number)
 * @param      {number} - Set the altitude.
 */

Coordinates.prototype.setAltitude = function setAltitude(altitude) {
    _assertIsGeographic(this.crs);
    this._values[2] = altitude;
};

/**
 * Returns the longitude in geocentric coordinates. Coordinates must be in geocentric system (can be
 * converted by using {@linkcode as()} ).
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
 *
 * @return     {number} - The longitude of the position.
 */

Coordinates.prototype.x = function x() {
    _assertIsGeocentric(this.crs);
    return this._values[0];
};

Coordinates.prototype.y = function y() {
    _assertIsGeocentric(this.crs);
    return this._values[1];
};

Coordinates.prototype.z = function z() {
    _assertIsGeocentric(this.crs);
    return this._values[2];
};

/**
 * Returns a position in cartesian coordinates. Coordinates must be in geocentric system (can be
 * converted by using {@linkcode as()} ).
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
 *
 * @return     {Position} - position
 */

Coordinates.prototype.xyz = function xyz(target) {
    _assertIsGeocentric(this.crs);
    const v = target || new THREE.Vector3();
    v.fromArray(this._values);
    return v;
};

/**
 * Convert coordinates in another CRS {@link http://inspire.ec.europa.eu/theme/rs|CRS}.
 *
 * if target is not specified, create a new instance. The original instance is never modified
 * (except if you passed it as `target`).
 *
 * @example
 *
 * const position = { longitude: 2.33, latitude: 48.24, altitude: 24999549 };
 * // Geographic system
 * const coords =
 *     new Coordinates('EPSG:4326', position.longitude, position.latitude, position.altitude);
 * const coordinates = coords.as('EPSG:4978'); // Geocentric system
 *
 * @param      {string} - {@link http://inspire.ec.europa.eu/theme/rs|crs} EPSG string
 * @return     {Position} - a new Coordinates object or position
 */

Coordinates.prototype.as = function as(crs, target) {
    if (crs === undefined || crsToUnit(crs) === undefined) {
        throw new Error(`Invalid crs paramater value '${crs}'`);
    }
    return _convert(this, crs, target);
};

/**
 * Returns the normalized offset from top-left in extent of this Coordinates
 * e.g: extent.center().offsetInExtent(extent) would return (0.5, 0.5).
 * @param {Extent} extent
 * @param {Vector2} target optional Vector2 target. If not present a new one will be created
 * @return {Vector2} normalized offset in extent
 */
Coordinates.prototype.offsetInExtent = function offsetInExtent(extent, target) {
    if (this.crs !== extent.crs()) {
        throw new Error('unsupported mix');
    }

    const dimension = {
        x: Math.abs(extent.east() - extent.west()),
        y: Math.abs(extent.north() - extent.south()),
    };

    const x = crsIsGeocentric(this.crs) ? this.x() : this.longitude();
    const y = crsIsGeocentric(this.crs) ? this.y() : this.latitude();

    const originX = (x - extent.west()) / dimension.x;
    const originY = (extent.north() - y) / dimension.y;

    target = target || new THREE.Vector2();
    target.set(originX, originY);
    return target;
};

export const C = {

    /**
     * Return a Coordinates object from a position object. The object just
     * needs to have x, y, z properties.
     *
     * @param {string} crs - The crs of the original position
     * @param {Object} position - the position to transform
     * @param {number} position.x - the x component of the position
     * @param {number} position.y - the y component of the position
     * @param {number} position.z - the z component of the position
     * @return {Coordinates}
     */
    EPSG_4326: function EPSG_4326(...args) {
        return new Coordinates('EPSG:4326', ...args);
    },
};

export default Coordinates;
