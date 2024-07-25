import { MathUtils } from 'three';
import type LatLon from './LatLon';

const m = Math;
const PI = m.PI;
const sin = m.sin;
const cos = m.cos;
const tan = m.tan;
const asin = m.asin;
const atan = m.atan2;

const rad = PI / 180;
const dayMs = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // obliquity of the Earth

function toJulian(date: Date) {
    return date.valueOf() / dayMs - 0.5 + J1970;
}

function toDays(date: Date) {
    return toJulian(date) - J2000;
}

function getRightAscension(l: number, b: number) {
    return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l));
}

function getDeclination(l: number, b: number) {
    return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l));
}

function getSolarMeanAnomaly(d: number) {
    return rad * (357.5291 + 0.98560028 * d);
}

function getEquationOfCenter(M: number) {
    return rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M));
}

function getEclipticLongitude(M: number, C: number) {
    const P = rad * 102.9372; // perihelion of the Earth
    return M + C + P + PI;
}

function getSunPosition(date: Date): LatLon {
    const d = toDays(date);
    const M = getSolarMeanAnomaly(d);
    const C = getEquationOfCenter(M);
    const L = getEclipticLongitude(M, C);
    const D = getDeclination(L, 0);
    const A = getRightAscension(L, 0);

    const dayMilliSec = 24 * 3600000;
    const longitude =
        MathUtils.degToRad(A) + ((date.valueOf() % dayMilliSec) / dayMilliSec) * -360 + 180;
    return {
        latitude: MathUtils.radToDeg(D),
        longitude,
    };
}

export default {
    getSunPosition,
};
