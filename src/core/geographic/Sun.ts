import { MathUtils } from 'three';
import Coordinates from './Coordinates';

function computeJulianDate(date: Date) {
    let year = date.getUTCFullYear();
    let month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    const second = date.getUTCSeconds();

    const dayFraction = (hour + minute / 60 + second / 3600) / 24;

    if (month <= 2) {
        year -= 1;
        month += 12;
    }

    const A = Math.floor(year / 100);
    const B = 2 - A + Math.floor(A / 4);
    const JD0h =
        Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;

    return JD0h + dayFraction;
}

function normalizedDegreesLongitude(degrees: number) {
    const lon = degrees % 360;

    return lon > 180 ? lon - 360 : lon < -180 ? 360 + lon : lon;
}

function normalizeAngle360(degrees: number): number {
    const angle = degrees % 360;
    return angle >= 0 ? angle : angle < 0 ? 360 + angle : 360 - angle;
}

type Celestial = { rightAscension: number; declination: number };

function celestialToGeographic(celestialLocation: Celestial, date: Date) {
    const julianDate = computeJulianDate(date);

    //number of days (positive or negative) since Greenwich noon, Terrestrial Time, on 1 January 2000 (J2000.0)
    const numDays = julianDate - 2451545;

    //Greenwich Mean Sidereal Time
    const GMST = normalizeAngle360(280.46061837 + 360.98564736629 * numDays);

    //Greenwich Hour Angle
    const GHA = normalizeAngle360(GMST - celestialLocation.rightAscension);

    const longitude = normalizedDegreesLongitude(-GHA);

    return {
        latitude: celestialLocation.declination,
        longitude: longitude,
    };
}

/**
 * Gets the position of the sun in [**equatorial coordinates**](https://en.wikipedia.org/wiki/Position_of_the_Sun#Equatorial_coordinates)
 * at the given date.
 *
 * Note: the geographic position of the sun is the location on earth where the sun is at the zenith.
 * @param date - The date to compute the geographic position. If unspecified, the current date is used.
 * @returns The geographic position of the sun at the given date.
 */
function getGeographicPosition(date?: Date, target?: Coordinates): Coordinates {
    date = date ?? new Date();

    const JD = computeJulianDate(date);
    const numDays = JD - 2451545;
    // Mean longitude of the sun, in degrees
    const meanLongitude = normalizeAngle360(280.46 + 0.9856474 * numDays);
    // Mean anomaly of the sun, in radians
    const meanAnomalyRad = normalizeAngle360(357.528 + 0.9856003 * numDays) * MathUtils.DEG2RAD;
    // Ecliptic longitude of the sun, in degrees
    const eclipticLongitude =
        meanLongitude + 1.915 * Math.sin(meanAnomalyRad) + 0.02 * Math.sin(2 * meanAnomalyRad);
    const eclipticLongitudeRad = eclipticLongitude * MathUtils.DEG2RAD;
    // Obliquity of the ecliptic, in radians
    const obliquityOfTheEcliptic = MathUtils.DEG2RAD * (23.439 - 0.0000004 * numDays);

    const declination =
        Math.asin(Math.sin(obliquityOfTheEcliptic) * Math.sin(eclipticLongitudeRad)) *
        MathUtils.RAD2DEG;

    let rightAscension =
        Math.atan(Math.cos(obliquityOfTheEcliptic) * Math.tan(eclipticLongitudeRad)) *
        MathUtils.RAD2DEG;

    //compensate for atan result
    if (eclipticLongitude >= 90 && eclipticLongitude < 270) {
        rightAscension += 180;
    }
    rightAscension = normalizeAngle360(rightAscension);

    const { latitude, longitude } = celestialToGeographic({ rightAscension, declination }, date);

    target = target ?? new Coordinates('EPSG:4326', 0, 0);

    target.set('EPSG:4326', longitude, latitude);

    return target;
}

/**
 * Utility functions related to the position of the sun.
 */
export default {
    getGeographicPosition,
};
