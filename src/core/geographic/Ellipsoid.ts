import { MathUtils, Vector2, Vector3 } from 'three';
import type Extent from './Extent';
import Coordinates from './Coordinates';

const tmpCoord = new Coordinates('EPSG:4326', 0, 0);
const tmpDims = new Vector2();

let wgs84: unknown;

/**
 * A configurable spheroid that allows conversion from and to geodetic coordinates
 * and cartesian coordinates, as well as utility function to compute various geodetic values.
 */
export default class Ellipsoid {
    private readonly _semiMajor: number;
    private readonly _semiMinor: number;
    private readonly _sqEccentricity: number;
    private readonly _eccentricity: number;
    private readonly _equatorialCircumference;

    get semiMajorAxis() {
        return this._semiMajor;
    }

    get semiMinorAxis() {
        return this._semiMinor;
    }

    constructor(params: { semiMajorAxis: number; semiMinorAxis: number }) {
        this._semiMajor = params.semiMajorAxis; // Semi-major axis
        this._semiMinor = params.semiMinorAxis; // Semi-minor axis
        const flattening = (this._semiMajor - this._semiMinor) / this._semiMajor; // Flattening
        this._sqEccentricity = Math.sqrt(1 - this._semiMinor ** 2 / this._semiMajor ** 2);
        this._eccentricity = Math.sqrt(2 * flattening - flattening * flattening);

        this._equatorialCircumference = Math.PI * 2 * this._semiMajor;
    }

    /**
     * The WGS84 ellipsoid.
     */
    static get WGS84(): Ellipsoid {
        if (!wgs84) {
            wgs84 = new Ellipsoid({
                semiMajorAxis: 6_378_137.0,
                semiMinorAxis: 6_356_752.314245,
            });
        }
        return wgs84 as Ellipsoid;
    }

    /**
     * Converts the geodetic coordinates to cartesian coordinates.
     * @param lat - The latitude, in degrees.
     * @param lon - The longitude, in degrees.
     * @param alt - The altitude, in meters, above or below the ellipsoid.
     * @param target - The target vector. If none, one will be created.
     * @returns The cartesian coordinates.
     */
    toCartesian(lat: number, lon: number, alt: number, target?: Vector3): Vector3 {
        target = target ?? new Vector3();

        const clat = Math.cos(lat * MathUtils.DEG2RAD);
        const slat = Math.sin(lat * MathUtils.DEG2RAD);
        const clon = Math.cos(lon * MathUtils.DEG2RAD);
        const slon = Math.sin(lon * MathUtils.DEG2RAD);

        const N =
            this._semiMajor /
            Math.sqrt(1.0 - this._eccentricity * this._eccentricity * slat * slat);

        const x = (N + alt) * clat * clon;
        const y = (N + alt) * clat * slon;
        const z = (N * (1.0 - this._eccentricity * this._eccentricity) + alt) * slat;

        target.set(x, y, z);

        return target;
    }

    /**
     * Converts the cartesian coordinates to geodetic coordinates.
     * @param x - The cartesian X coordinate.
     * @param y - The cartesian Y coordinate.
     * @param z - The cartesian Y coordinate.
     * @returns The geodetic coordinates.
     */
    toGeodetic(x: number, y: number, z: number, target?: Coordinates): Coordinates {
        target = target ?? new Coordinates('EPSG:4979', 0, 0, 0);
        const lon = Math.atan2(y, x);
        const p = Math.sqrt(x ** 2 + y ** 2);
        const theta = Math.atan2(z * this._semiMajor, p * this._semiMinor);
        const lat = Math.atan2(
            z + this._eccentricity ** 2 * this._semiMinor * Math.sin(theta) ** 3,
            p - this._sqEccentricity ** 2 * this._semiMajor * Math.cos(theta) ** 3,
        );

        // # Radius of curvature in the prime vertical
        const N = this._semiMajor / Math.sqrt(1 - this._sqEccentricity ** 2 * Math.sin(lat) ** 2);
        const height = p / Math.cos(lat) - N;

        const latitude = MathUtils.radToDeg(lat);
        const longitude = MathUtils.radToDeg(lon);

        target.set('EPSG:4979', longitude, latitude, height);

        return target;
    }

    /**
     * Returns the length of the parallel arc of the given angle, in meters.
     * @param latitude - The latitude of the parallel.
     * @param angle - The angle of the arc in degrees.
     */
    getParallelArcLength(latitude: number, angle: number): number {
        // Let's compute the radius of the parallel at this latitude
        const parallelRadius = this._semiMajor * Math.cos(latitude * MathUtils.DEG2RAD);
        const paralellCircumference = 2 * Math.PI * parallelRadius;

        return (angle / 360) * paralellCircumference;
    }

    /**
     * Returns the length of the meridian arc of the given angle, in meters.
     * @param angle - The angle of the arc in degrees.
     */
    getMeridianArcLength(angle: number): number {
        return (angle / 360) * this._equatorialCircumference;
    }

    /**
     * Gets the dimensions (width and height) across the center of of the extent, in **meters**.
     *
     * Note: this is distinct to {@link Extent.dimensions} which returns the dimensions
     * in the extent's own CRS (meters or degrees).
     * @param extent - The extent.
     * @param target - The object to store the result. If none, one will be created.
     * @returns The extent dimensions.
     * @throws if the extent is not in the EPSG:4326 CRS.
     */
    getExtentDimensions(extent: Extent, target?: Vector2): Vector2 {
        if (extent.crs() !== 'EPSG:4326') {
            throw new Error('not a WGS84 extent (EPSG:4326)');
        }

        const center = extent.center(tmpCoord);
        const dims = extent.dimensions(tmpDims);

        const width = this.getParallelArcLength(center.latitude, dims.width);
        const height = this.getMeridianArcLength(dims.height);

        target = target ?? new Vector2(width, height);

        return target;
    }

    /**
     * Determine whether the given point is visible from the camera or occluded by the horizon
     * of this ellipsoid.
     * @param cameraPosition - The camera position.
     * @param point - The point to test.
     * @returns `true` if the given point is above the horizon, `false` otherwise.
     */
    isHorizonVisible(cameraPosition: Vector3, point: Vector3): boolean {
        // We use a slightly smaller ellipsoid because we want to avoid false negatives
        // for negative elevations (think very deep seafloors).
        const RADIUS_FACTOR = 0.95;

        // https://cesium.com/blog/2013/04/25/horizon-culling/
        // Ellipsoid radii - WGS84 shown here
        const rX = this._semiMajor * RADIUS_FACTOR;
        const rY = this._semiMajor * RADIUS_FACTOR;
        const rZ = this._semiMinor * RADIUS_FACTOR;

        // Vector CV
        const cvX = cameraPosition.x / rX;
        const cvY = cameraPosition.y / rY;
        const cvZ = cameraPosition.z / rZ;

        const vhMagnitudeSquared = cvX * cvX + cvY * cvY + cvZ * cvZ - 1.0;

        // Target position, transformed to scaled space
        const tX = point.x / rX;
        const tY = point.y / rY;
        const tZ = point.z / rZ;

        // Vector VT
        const vtX = tX - cvX;
        const vtY = tY - cvY;
        const vtZ = tZ - cvZ;
        const vtMagnitudeSquared = vtX * vtX + vtY * vtY + vtZ * vtZ;

        // VT dot VC is the inverse of VT dot CV
        const vtDotVc = -(vtX * cvX + vtY * cvY + vtZ * cvZ);

        const isOccluded =
            vtDotVc > vhMagnitudeSquared &&
            (vtDotVc * vtDotVc) / vtMagnitudeSquared > vhMagnitudeSquared;

        return !isOccluded;
    }
}
