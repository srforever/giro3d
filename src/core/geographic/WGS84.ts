import { MathUtils, Vector3 } from 'three';

const WGS84_A = 6_378_137.0;
const WGS84_IF = 298.257223563;
const WGS84_F = 1 / WGS84_IF;
const WGS84_E = Math.sqrt(2 * WGS84_F - WGS84_F * WGS84_F);

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
