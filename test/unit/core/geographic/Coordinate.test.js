import proj4 from 'proj4';
import { Vector2, Vector3 } from 'three';
import assert from 'assert';
import Coordinates from '../../../../src/Core/Geographic/Coordinates.js';
import Extent from '../../../../src/Core/Geographic/Extent.js';

// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
proj4.defs('EPSG:3946', '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Asster two float number are equals, with 5 digits precision.
function assertFloatEqual(float1, float2, precision = 5) {
    assert.equal(Number(float1).toFixed(precision), Number(float2).toFixed(precision));
}

describe('Coordinates', () => {
    describe('constructor', () => {
        it('should throw on unrecognized CRS', () => {
            expect(() => new Coordinates('foo', 0, 1, 2)).toThrow();
        });

        it('should assign property crs', () => {
            const c = new Coordinates('EPSG:3857', 0, 1, 2);

            expect(c.crs).toEqual('EPSG:3857');
        });

        it('should support coordinates from number array', () => {
            const c = new Coordinates('EPSG:3857', 0, 1, 2);

            expect(c.x()).toEqual(0);
            expect(c.y()).toEqual(1);
            expect(c.z()).toEqual(2);
        });

        it('should support coordinates from Vector3', () => {
            const c = new Coordinates('EPSG:3857', new Vector3(0, 1, 2));

            expect(c.x()).toEqual(0);
            expect(c.y()).toEqual(1);
            expect(c.z()).toEqual(2);
        });
    });

    describe('offsetInExtent', () => {
        it('should return correct U value', () => {
            const west = 3024.22;
            const east = 32320932.3;

            const extent = new Extent('EPSG:3857', west, east, 0, 0);

            expect(new Coordinates('EPSG:3857', west, 0, 0).offsetInExtent(extent).x).toEqual(0);
            expect(new Coordinates('EPSG:3857', east, 0, 0).offsetInExtent(extent).x).toEqual(1);
        });

        it('should return correct V value', () => {
            const south = 3024.22;
            const north = 32320932.3;

            const extent = new Extent('EPSG:3857', 0, 0, south, north);

            expect(new Coordinates('EPSG:3857', 0, south, 0).offsetInExtent(extent).y).toEqual(0);
            expect(new Coordinates('EPSG:3857', 0, north, 0).offsetInExtent(extent).y).toEqual(1);
        });

        it('should return (0.5, 0.5) if coordinates is in the center of extent', () => {
            const center = new Vector3(44.55, 0.42, 0);

            const extent = new Extent(
                'EPSG:3857',
                center.x - 1000,
                center.x + 1000,
                center.y - 2330.2,
                center.y + 2330.2,
            );

            const coord = new Coordinates('EPSG:3857', center);

            expect(coord.offsetInExtent(extent)).toEqual({ x: 0.5, y: 0.5 });
        });

        it('should fill the target and return the target if it specified', () => {
            const target = new Vector2();

            const center = new Vector3(44.55, 0.42, 0);

            const extent = new Extent(
                'EPSG:3857',
                center.x - 1000,
                center.x + 1000,
                center.y - 2330.2,
                center.y + 2330.2,
            );

            const coord = new Coordinates('EPSG:3857', center);

            expect(coord.offsetInExtent(extent, target)).toEqual({ x: 0.5, y: 0.5 });
            expect(coord.offsetInExtent(extent, target)).toBe(target);
        });
    });

    describe('x(), y(), z()', () => {
        it('should return the correct values', () => {
            const c = new Coordinates('EPSG:3857', 1, 2, 3);

            expect(c.x()).toEqual(1);
            expect(c.y()).toEqual(2);
            expect(c.z()).toEqual(3);
        });

        it('should throw if the CRS is geographic', () => {
            const c = new Coordinates('EPSG:4326', 1, 2, 3);

            expect(() => c.x()).toThrow();
            expect(() => c.y()).toThrow();
            expect(() => c.z()).toThrow();
        });
    });

    describe('xyz()', () => {
        it('should return the x, y, z values', () => {
            const c = new Coordinates('EPSG:3857', 1, 2, 3);
            expect(c.xyz()).toEqual({ x: 1, y: 2, z: 3 });
        });

        it('should honor the passed target the x, y, z values', () => {
            const c = new Coordinates('EPSG:3857', 1, 2, 3);
            const target = new Vector3(-1, -1, -1);
            expect(c.xyz(target)).toEqual({ x: 1, y: 2, z: 3 });
            expect(c.xyz(target)).toBe(target);
        });
    });

    describe('isGeographic()', () => {
        it('should return true for EPSG:4326', () => {
            expect(new Coordinates('EPSG:4326', 0, 0, 0).isGeographic()).toBeTruthy();
        });

        it('should return false for EPSG:3857', () => {
            expect(new Coordinates('EPSG:3857', 0, 0, 0).isGeographic()).toBeFalsy();
        });
    });

    describe('as()', () => {
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

    describe('geodesicNormal', () => {
        it('should correctly return the default up vector for planar mode ', () => {
            const coord0 = new Coordinates('EPSG:3946', 15.0, 12.0);

            const normal0 = coord0.geodesicNormal;

            assert.equal(0, normal0.x);
            assert.equal(0, normal0.y);
            assert.equal(1, normal0.z);
        });
    });
});
