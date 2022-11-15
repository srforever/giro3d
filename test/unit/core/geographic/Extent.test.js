import assert from 'assert';
import { Box3, Vector3 } from 'three';
import Coordinates from '../../../../src/Core/Geographic/Coordinates.js';
import Extent from '../../../../src/Core/Geographic/Extent.js';

const BOUNDS_EPSG4326 = new Extent('EPSG:4326', {
    south: -90, north: +90, east: +180, west: -180,
});

const BOUNDS_EPSG3857 = new Extent('EPSG:3857',
    new Coordinates('EPSG:3857', -20026376.39, -20048966.10),
    new Coordinates('EPSG:3857', +20026376.39, +20048966.10));

describe('Extent', () => {
    describe('constructor', () => {
        const minX = 0;
        const maxX = 10;
        const minY = -1;
        const maxY = 3;

        it('should build the expected extent using Coordinates', () => {
            const withCoords = new Extent('EPSG:4326',
                new Coordinates('EPSG:4326', minX, minY),
                new Coordinates('EPSG:4326', maxX, maxY));
            assert.equal(minX, withCoords.west());
            assert.equal(maxX, withCoords.east());
            assert.equal(minY, withCoords.south());
            assert.equal(maxY, withCoords.north());
        });

        it('should build the expected extent using keywords', () => {
            const withKeywords = new Extent('EPSG:4326', {
                south: minY,
                east: maxX,
                north: maxY,
                west: minX,
            });
            assert.equal(minX, withKeywords.west());
            assert.equal(maxX, withKeywords.east());
            assert.equal(minY, withKeywords.south());
            assert.equal(maxY, withKeywords.north());
        });

        it('should build the expected extent using values', () => {
            const withValues = new Extent('EPSG:4326',
                minX,
                maxX,
                minY,
                maxY);
            assert.equal(minX, withValues.west());
            assert.equal(maxX, withValues.east());
            assert.equal(minY, withValues.south());
            assert.equal(maxY, withValues.north());
        });

        it('should build the expected extent from box3', () => {
            const box = new Box3(
                new Vector3(Math.random(), Math.random()),
                new Vector3(Math.random(), Math.random()),
            );
            const fromBox = Extent.fromBox3('EPSG:4978', box);

            assert.equal(fromBox.west(), box.min.x);
            assert.equal(fromBox.east(), box.max.x);
            assert.equal(fromBox.north(), box.max.y);
            assert.equal(fromBox.south(), box.min.y);
        });
    });

    describe('clone', () => {
        it('should return a new Extent', () => {
            const south = -43;
            const north = 34;
            const east = 22.34;
            const west = -179.99;

            const original = new Extent('EPSG:4326', {
                south, north, east, west,
            });

            const copy = original.clone();

            assert.notEqual(copy, original, 'clone() should return a different object!');
            assert.deepEqual(copy, original);

            assert.equal(south, copy.south());
            assert.equal(north, copy.north());
            assert.equal(east, copy.east());
            assert.equal(west, copy.west());
        });

        it('should return a tiled CRS if original is TMS', () => {
            const zoom = 10;
            const row = 5;
            const col = 12;

            const original = new Extent('TMS', zoom, row, col);
            const copy = original.clone();

            assert.notEqual(copy, original, 'clone() should return a different object!');
            assert.deepEqual(copy, original);
            assert.equal(copy.zoom, zoom);
            assert.equal(copy.col, col);
            assert.equal(copy.row, row);
        });

        it('should return a tiled CRS if original is WMTS', () => {
            const zoom = 10;
            const row = 5;
            const col = 12;

            const original = new Extent('WMTS:WGS84', zoom, row, col);
            const copy = original.clone();

            assert.notEqual(copy, original, 'clone() should return a different object!');
            assert.deepEqual(copy, original);
            assert.equal(copy.zoom, zoom);
            assert.equal(copy.col, col);
            assert.equal(copy.row, row);
        });
    });

    describe('as', () => {
        it('should throw if target CRS is invalid', () => {
            const original = new Extent('EPSG:4326', {
                south: -5, east: 5, north: 5, west: -5,
            });

            assert.throws(() => original.as('foo'));
        });

        it('should return the original object if target CRS is same as source CRS', () => {
            const original = new Extent('EPSG:4326', {
                south: -5, east: 5, north: 5, west: -5,
            });

            const projected = original.as('EPSG:4326');

            assert.equal(projected, original);
        });

        it('should return a different object if source and target CRSes are different', () => {
            const original = new Extent('EPSG:4326', {
                south: -5, east: 5, north: 5, west: -5,
            });

            const projected = original.as('EPSG:3857'); // Spherical Mercator
            assert.notEqual(original, projected, 'it should be a different object');
        });

        it('should return the western hemisphere if it is the (0, 0, 0) WMTS tile in EPSG:4326', () => {
            const original = new Extent('WMTS:WGS84G', 0, 0, 0);
            const projected = original.as('EPSG:4326');

            assert.equal(projected.west(), -180.0);
            assert.equal(projected.east(), 0);
            assert.equal(projected.north(), +90.0);
            assert.equal(projected.south(), -90.0);
        });

        it('should return the eastern hemisphere if it is the (0, 0, 1) WMTS tile in EPSG:4326', () => {
            const original = new Extent('WMTS:WGS84G', 0, 0, 1);
            const projected = original.as('EPSG:4326');

            assert.equal(projected.west(), 0);
            assert.equal(projected.east(), +180.0);
            assert.equal(projected.north(), +90.0);
            assert.equal(projected.south(), -90.0);
        });
    });

    describe('center', () => {
        it('should return a new object if none was provided', () => {
            const result = BOUNDS_EPSG4326.center();
            assert.notEqual(result, undefined);
        });

        it('should return the argument object if provided', () => {
            const target = new Coordinates('EPSG:4326', -1, -1);
            const result = BOUNDS_EPSG4326.center(target);
            expect(target).toBe(result);
            expect(target.longitude()).toBe(0);
            expect(target.latitude()).toBe(0);
        });

        it('should center the target if { x, y } provided', () => {
            const target = { x: -1, y: -1 };
            const result = BOUNDS_EPSG4326.center(target);
            expect(target).toBe(result);
            expect(target.x).toBe(0);
            expect(target.y).toBe(0);
        });

        it('should return (0, 0) if extent is the EPSG:4326 bounds', () => {
            const result = BOUNDS_EPSG4326.center();
            expect(result.longitude()).toBe(0);
            expect(result.latitude()).toBe(0);
        });

        it('should return (0, 0) if extent is the EPSG:3857 bounds', () => {
            const result = BOUNDS_EPSG3857.center();
            expect(result.x()).toBe(0);
            expect(result.y()).toBe(0);
        });
    });

    describe('dimensions', () => {
        it('should return a new object if none was provided', () => {
            const result = BOUNDS_EPSG4326.dimensions();
            expect(result).toBeDefined();
        });

        it('should return the passed object if any', () => {
            const target = { x: NaN, y: NaN };
            const result = BOUNDS_EPSG4326.dimensions(target);
            expect(Object.is(result, target)).toBe(true);
        });

        it('should return (360, 180) for the EPSG:4326 bounds', () => {
            const result = BOUNDS_EPSG4326.dimensions();
            expect(result.x).toBe(360);
            expect(result.y).toBe(180);
        });

        it('should return the correct EPSG:3857 dimensions', () => {
            const result = BOUNDS_EPSG3857.dimensions();
            expect(result.x).toBe(40052752.78);
            expect(result.y).toBe(40097932.2);
        });
    });

    describe('isPointInside', () => {
        it('should return true if point is inside', () => {
            const extent = new Extent('EPSG:4326', {
                south: 25, north: 30, east: 54, west: 52,
            });
            expect(extent.isPointInside(new Coordinates('EPSG:4326', 53, 28, 0)))
                .toBe(true);
        });

        it.each([-1, 0, 1, 5555555, Infinity, -Infinity, NaN])(
            'should ignore altitude/Z (z = %d)',
            z => {
                const extent = new Extent('EPSG:4326', {
                    south: 25, north: 30, east: 54, west: 52,
                });
                expect(extent.isPointInside(new Coordinates('EPSG:4326', 53, 28, z)))
                    .toBe(true);
            },
        );
    });

    describe('fromBox3', () => {
        it('should return the correct values and CRS', () => {
            const box = {
                min: { x: 1, y: 2 },
                max: { x: 8, y: 9 },
            };

            const extent = Extent.fromBox3('EPSG:4326', box);

            expect(extent.crs()).toBe('EPSG:4326');
            expect(extent.west()).toBe(box.min.x);
            expect(extent.east()).toBe(box.max.x);
            expect(extent.north()).toBe(box.max.y);
            expect(extent.south()).toBe(box.min.y);
        });
    });

    describe('offsetToParent', () => {
        it('works', () => {
            const right = new Extent('foo', 0, 10, 0, 10);
            const left = new Extent('foo', -10, 0, 0, 10);
            const rightBig = new Extent('foo', 0, 20, 0, 20);

            let offset = left.offsetToParent(right);

            expect(offset.y).toEqual(0);
            expect(offset.x).toEqual(-1);
            expect(offset.z).toEqual(1);
            expect(offset.w).toEqual(1);

            offset = right.offsetToParent(left);

            expect(offset.y).toEqual(0);
            expect(offset.x).toEqual(1);
            expect(offset.z).toEqual(1);
            expect(offset.w).toEqual(1);

            offset = left.offsetToParent(rightBig);

            expect(offset.y).toEqual(0.5);
            expect(offset.x).toEqual(-0.5);
            expect(offset.z).toEqual(0.5);
            expect(offset.w).toEqual(0.5);
        });
    });

    describe('externalBorders', () => {
        it('should return 4 extents sharing an edge with the original extent', () => {
            const minX = 0;
            const maxX = 10;
            const minY = 2;
            const maxY = 15;
            const ratio = 0.4;

            const extent = new Extent('foo', minX, maxX, minY, maxY);
            const borders = extent.externalBorders(ratio);

            expect(borders).toHaveLength(4);
            const north = borders[0];
            const east = borders[1];
            const south = borders[2];
            const west = borders[3];

            expect(north.west()).toEqual(extent.west());
            expect(north.east()).toEqual(extent.east());
            expect(north.south()).toEqual(extent.north());
            expect(north.north()).toEqual(extent.north() + extent.dimensions().y * ratio);

            expect(east.west()).toEqual(extent.east());
            expect(east.east()).toEqual(extent.east() + extent.dimensions().x * ratio);
            expect(east.south()).toEqual(extent.south());
            expect(east.north()).toEqual(extent.north());

            expect(south.north()).toEqual(extent.south());
            expect(south.east()).toEqual(extent.east());
            expect(south.west()).toEqual(extent.west());
            expect(south.south()).toEqual(extent.south() - extent.dimensions().y * ratio);

            expect(west.west()).toEqual(extent.west() - extent.dimensions().x * ratio);
            expect(west.east()).toEqual(extent.west());
            expect(west.south()).toEqual(extent.south());
            expect(west.north()).toEqual(extent.north());
        });
    });

    describe('split', () => {
        it('should throw on invalid subdivisions', () => {
            expect(() => BOUNDS_EPSG3857.split(0, 1)).toThrow(/Invalid subdivisions/);
            expect(() => BOUNDS_EPSG3857.split(1, 0)).toThrow(/Invalid subdivisions/);
        });

        it('should return a copy of the original extent if subdivisions are 1, 1', () => {
            const result = BOUNDS_EPSG3857.split(1, 1);
            expect(result).toHaveLength(1);
            expect(result[0]).not.toBe(BOUNDS_EPSG3857);
            expect(result[0]).toEqual(BOUNDS_EPSG3857);
        });

        it('should return the correct value', () => {
            const extent = new Extent('foo', 0, 100, 0, 100);

            const splitHorizontally = extent.split(4, 1);
            const splitVertically = extent.split(1, 4);

            expect(splitHorizontally).toHaveLength(4);
            expect(splitVertically).toHaveLength(4);

            expect(splitHorizontally[0]).toEqual(new Extent('foo', 0, 25, 0, 100));
            expect(splitHorizontally[1]).toEqual(new Extent('foo', 25, 50, 0, 100));
            expect(splitHorizontally[2]).toEqual(new Extent('foo', 50, 75, 0, 100));
            expect(splitHorizontally[3]).toEqual(new Extent('foo', 75, 100, 0, 100));

            expect(splitVertically[0]).toEqual(new Extent('foo', 0, 100, 0, 25));
            expect(splitVertically[1]).toEqual(new Extent('foo', 0, 100, 25, 50));
            expect(splitVertically[2]).toEqual(new Extent('foo', 0, 100, 50, 75));
            expect(splitVertically[3]).toEqual(new Extent('foo', 0, 100, 75, 100));
        });
    });
});
