import { MathUtils, Vector3 } from 'three';

const WGS84_A = 6_378_137.0;
const WGS84_IF = 298.257223563;
const WGS84_F = 1 / WGS84_IF;
const WGS84_E = Math.sqrt(2 * WGS84_F - WGS84_F * WGS84_F);

/**
 * Converts the geographic coordinate to ECEF cartesian coordinates.
 * @param lat - The latitude, in degrees.
 * @param lon - The longitude, in degrees.
 * @param alt - The altitude, in meters, above or below the WGS84 ellipsoid.
 * @param target - The target vector.
 * @returns The cartesian coordinates.
 */
export function latLonToEcef(lat: number, lon: number, alt: number, target?: Vector3): Vector3 {
    target = target ?? new Vector3();

    const clat = Math.cos(lat * MathUtils.DEG2RAD);
    const slat = Math.sin(lat * MathUtils.DEG2RAD);
    const clon = Math.cos(lon * MathUtils.DEG2RAD);
    const slon = Math.sin(lon * MathUtils.DEG2RAD);

    const N = WGS84_A / Math.sqrt(1.0 - WGS84_E * WGS84_E * slat * slat);

    const x = (N + alt) * clat * clon;
    const y = (N + alt) * clat * slon;
    const z = (N * (1.0 - WGS84_E * WGS84_E) + alt) * slat;

    target.set(x, y, z);

    return target;
}

/**
 * Returns the length of the parallel arc of the given angle, in meters.
 * @param latitude - The latitude of the parallel.
 * @param angle - The angle of the arc in degrees.
 */
export function getParallelArcLength(latitude: number, angle: number): number {
    // Let's compute the radius of the parallel at this latitude
    const parallelRadius = WGS84_A * Math.cos(latitude * MathUtils.DEG2RAD);
    const paralellCircumference = 2 * Math.PI * parallelRadius;

    return (angle / 360) * paralellCircumference;
}

/**
 * Returns the length of the meridian arc of the given angle, in meters.
 * @param angle - The angle of the arc in degrees.
 */
export function getMeridianArcLength(angle: number): number {
    const MERIDIONAL_CIRCUMFERENCE = 40_008_000;

    return (angle / 360) * MERIDIONAL_CIRCUMFERENCE;
}
