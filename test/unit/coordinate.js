/* global describe, it */
import proj4 from 'proj4';
import assert from 'assert';
import Coordinates from '../../src/Core/Geographic/Coordinates.js';

// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
proj4.defs('EPSG:3946', '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Asster two float number are equals, with 5 digits precision.
function assertFloatEqual(float1, float2, precision = 5) {
    assert.equal(Number(float1).toFixed(precision), Number(float2).toFixed(precision));
}

describe('Coordinate conversions', () => {
    // This case happend in giro3d when we convert the tile extent (4326) to a target WFS server
    // (EPSG:3946 for example) to request Lyon bus line in WFS.
    it('should correctly convert from EPSG:4326 (tiles extent) to EPSG:3946 (Lyon WFS) and back to EPSG:4326 (degrees)', () => {
        // geographic example for EPSG 4326 in degrees
        const longIn = 4.82212;
        const latIn = 45.723722;
        // let's define an input coordinate EPSG:4326.
        const coord1 = new Coordinates('EPSG:4326', longIn, latIn);
        // convert coordinate in EPSG:3946
        const coord2 = coord1.as('EPSG:3946');
        // verify intermediate values
        assertFloatEqual(1841825.45, coord2.x(), 2);
        assertFloatEqual(5170916.93, coord2.y(), 2);
        // and convert back to EPSG:4626 standard in degree.
        const coord3 = coord2.as('EPSG:4326');
        // verify coordinates
        assertFloatEqual(longIn, coord3.longitude());
        assertFloatEqual(latIn, coord3.latitude());
    });
});

describe('Coordinate surface normale property', () => {
    it('should correctly return the default up vector for planar mode ', () => {
        const coord0 = new Coordinates('EPSG:3946', 15.0, 12.0);

        const normal0 = coord0.geodesicNormal;

        assert.equal(0, normal0.x);
        assert.equal(0, normal0.y);
        assert.equal(1, normal0.z);
    });
});
