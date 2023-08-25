import { Box3, Vector2, Vector3 } from 'three';
import Coordinates from 'src/core/geographic/Coordinates';
import Extent from 'src/core/geographic/Extent';

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

            expect(minX).toEqual(withCoords.west());
            expect(maxX).toEqual(withCoords.east());
            expect(minY).toEqual(withCoords.south());
            expect(maxY).toEqual(withCoords.north());
        });

        it('should build the expected extent using keywords', () => {
            const withKeywords = new Extent('EPSG:4326', {
                south: minY,
                east: maxX,
                north: maxY,
                west: minX,
            });
            expect(minX).toEqual(withKeywords.west());
            expect(maxX).toEqual(withKeywords.east());
            expect(minY).toEqual(withKeywords.south());
            expect(maxY).toEqual(withKeywords.north());
        });

        it('should build the expected extent using values', () => {
            const withValues = new Extent('EPSG:4326',
                minX,
                maxX,
                minY,
                maxY);
            expect(minX).toEqual(withValues.west());
            expect(maxX).toEqual(withValues.east());
            expect(minY).toEqual(withValues.south());
            expect(maxY).toEqual(withValues.north());
        });

        it('should build the expected extent from box3', () => {
            const box = new Box3(
                new Vector3(Math.random(), Math.random()),
                new Vector3(Math.random(), Math.random()),
            );
            const fromBox = Extent.fromBox3('EPSG:4978', box);

            expect(fromBox.west()).toEqual(box.min.x);
            expect(fromBox.east()).toEqual(box.max.x);
            expect(fromBox.north()).toEqual(box.max.y);
            expect(fromBox.south()).toEqual(box.min.y);
        });
    });

    describe('set()', () => {
        it('should assign the values', () => {
            const extent = new Extent('EPSG:4326', 0, 0, 0, 0);
            extent.set('EPSG:3857', -1, 2, -3, 5);

            expect([...extent.values]).toStrictEqual([-1, 2, -3, 5]);
            expect(extent.crs()).toEqual('EPSG:3857');
        });
    });

    describe('offsetInExtent', () => {
        it('should return correct U value', () => {
            const west = 3024.22;
            const east = 32320932.3;

            const extent = new Extent('EPSG:3857', west, east, 0, 0);

            expect(extent.offsetInExtent(new Coordinates('EPSG:3857', west, 0, 0)).x).toEqual(0);
            expect(extent.offsetInExtent(new Coordinates('EPSG:3857', east, 0, 0)).x).toEqual(1);
        });

        it('should return correct V value', () => {
            const south = 3024.22;
            const north = 32320932.3;

            const extent = new Extent('EPSG:3857', 0, 0, south, north);

            expect(extent.offsetInExtent(new Coordinates('EPSG:3857', 0, south, 0)).y).toEqual(0);
            expect(extent.offsetInExtent(new Coordinates('EPSG:3857', 0, north, 0)).y).toEqual(1);
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

            expect(extent.offsetInExtent(coord)).toEqual({ x: 0.5, y: 0.5 });
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

            expect(extent.offsetInExtent(coord, target)).toEqual({ x: 0.5, y: 0.5 });
            expect(extent.offsetInExtent(coord, target)).toBe(target);
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

            expect(copy).not.toBe(original);

            expect(south).toEqual(copy.south());
            expect(north).toEqual(copy.north());
            expect(east).toEqual(copy.east());
            expect(west).toEqual(copy.west());
        });
    });

    describe('check', () => {
        it('should return false if extent has infinite values', () => {
            expect(new Extent('EPSG:3857', NaN, 1, 0, 1).isValid()).toEqual(false);
            expect(new Extent('EPSG:3857', Infinity, 1, 0, 1).isValid()).toEqual(false);
            expect(new Extent('EPSG:3857', 0, 1, Infinity, 1).isValid()).toEqual(false);
        });

        it('should return false if extent is invalid', () => {
            const invalidX = new Extent('EPSG:3857', +10, -10, 0, 10);
            const invalidY = new Extent('EPSG:3857', 0, 10, +10, -10);
            expect(invalidX.isValid()).toEqual(false);
            expect(invalidY.isValid()).toEqual(false);
        });

        it('should return true if the extent is valid', () => {
            expect(new Extent('EPSG:3857', 0, 10, -12, 223).isValid()).toEqual(true);
        });
    });

    describe('as', () => {
        it('should throw if target CRS is invalid', () => {
            const original = new Extent('EPSG:4326', {
                south: -5, east: 5, north: 5, west: -5,
            });

            expect(() => original.as('foo')).toThrow();
        });

        it('should return the original object if target CRS is same as source CRS', () => {
            const original = new Extent('EPSG:4326', {
                south: -5, east: 5, north: 5, west: -5,
            });

            const projected = original.as('EPSG:4326');

            expect(projected).toEqual(original);
        });

        it('should return a different object if source and target CRSes are different', () => {
            const original = new Extent('EPSG:4326', {
                south: -5, east: 5, north: 5, west: -5,
            });

            const projected = original.as('EPSG:3857'); // Spherical Mercator
            expect(original).not.toEqual(projected);
        });
    });

    describe('center', () => {
        it('should return a new object if none was provided', () => {
            const result = BOUNDS_EPSG4326.center();
            expect(result).not.toBeUndefined();
        });

        it('should return the argument object if provided', () => {
            const target = new Coordinates('EPSG:4326', -1, -1);
            const result = BOUNDS_EPSG4326.center(target);
            expect(target).toBe(result);
            expect(target.longitude()).toBe(0);
            expect(target.latitude()).toBe(0);
        });

        it('should center the target if { x, y } provided', () => {
            const target = new Vector2(-1, -1);
            const result = BOUNDS_EPSG4326.center(target) as Vector2;
            expect(target).toBe(result);
            expect(target.x).toBe(0);
            expect(target.y).toBe(0);
        });

        it('should return (0, 0) if extent is the EPSG:4326 bounds', () => {
            const result = BOUNDS_EPSG4326.center() as Coordinates;
            expect(result.longitude()).toBe(0);
            expect(result.latitude()).toBe(0);
        });

        it('should return (0, 0) if extent is the EPSG:3857 bounds', () => {
            const result = BOUNDS_EPSG3857.center() as Coordinates;
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
            const target = new Vector2(NaN, NaN);
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

    describe('intersectExtent', () => {
        it('should return true if extents intersect', () => {
            const small = new Extent(
                'EPSG:3857',
                -10018754.171394622,
                0,
                20037508.342789244,
                30056262.514183864,
            );

            const big = new Extent(
                'EPSG:3857',
                -20037508.342789244,
                20037508.342789244,
                -20037508.342789244,
                20037508.342789244,
            );

            expect(small.intersectsExtent(big)).toEqual(false);
            expect(big.intersectsExtent(small)).toEqual(false);
        });
    });

    describe('toBox3', () => {
        it('should return the correct value', () => {
            const extent = new Extent('foo', 0, 100, 54, 233);
            const minHeight = 23.3;
            const maxHeight = 400.3;
            const box = extent.toBox3(minHeight, maxHeight);

            expect(box.min.x).toBe(extent.west());
            expect(box.max.x).toBe(extent.east());
            expect(box.min.y).toBe(extent.south());
            expect(box.max.y).toBe(extent.north());
            expect(box.min.z).toBe(minHeight);
            expect(box.max.z).toBe(maxHeight);
        });
    });

    describe('withMargin', () => {
        it('should returns different objects', () => {
            const extent = new Extent('EPSG:3857', 5, 1132, 4204.2, 10000.4);
            const margin = extent.withMargin(10, 10);

            expect(extent).not.toBe(margin);
        });

        it('should returns correct values', () => {
            const xmargin = 10.2;
            const ymargin = 7.4;
            const extent = new Extent('EPSG:3857', 5, 1132, 4204.2, 10000.4);
            const result = extent.withMargin(xmargin, ymargin);

            expect(result.west()).toEqual(extent.west() - xmargin);
            expect(result.east()).toEqual(extent.east() + xmargin);
            expect(result.south()).toEqual(extent.south() - ymargin);
            expect(result.north()).toEqual(extent.north() + ymargin);
        });
    });

    describe('withRelativeMargin', () => {
        it('should returns different objects', () => {
            const extent = new Extent('EPSG:3857', 5, 1132, 4204.2, 10000.4);
            const margin = extent.withRelativeMargin(0.1);

            expect(extent).not.toBe(margin);
        });

        it('should returns correct values', () => {
            const xmargin = 10;
            const ymargin = 20;
            const extent = new Extent('EPSG:3857', 0, 100, 0, 200);
            const result = extent.withRelativeMargin(0.1);

            expect(result.west()).toEqual(extent.west() - xmargin);
            expect(result.east()).toEqual(extent.east() + xmargin);
            expect(result.south()).toEqual(extent.south() - ymargin);
            expect(result.north()).toEqual(extent.north() + ymargin);
        });
    });

    describe('fromBox3', () => {
        it('should return the correct values and CRS', () => {
            const box = new Box3(new Vector3(1, 2), new Vector3(8, 9));

            const extent = Extent.fromBox3('EPSG:4326', box);

            expect(extent.crs()).toBe('EPSG:4326');
            expect(extent.west()).toBe(box.min.x);
            expect(extent.east()).toBe(box.max.x);
            expect(extent.north()).toBe(box.max.y);
            expect(extent.south()).toBe(box.min.y);
        });
    });

    describe('offsetToParent', () => {
        it('should return 0, 0, 1, 1 for equal extents', () => {
            const minX = -14;
            const maxX = 32.5;
            const minY = -3.54;
            const maxY = 150.4;

            const a = new Extent('foo', minX, maxX, minY, maxY);
            const b = new Extent('foo', minX, maxX, minY, maxY);

            const expected = {
                x: 0, y: 0, z: 1, w: 1,
            };

            expect(a.offsetToParent(b)).toEqual(expected);
            expect(b.offsetToParent(a)).toEqual(expected);
        });

        it('should return 0, -1, 1, 1 for equal extents that share their south/north border', () => {
            const minX = -14;
            const maxX = 32.5;
            const minY = -3.54;
            const maxY = 150.4;

            const top = new Extent('foo', minX, maxX, maxY, maxY + (maxY - minY));
            const bottom = new Extent('foo', minX, maxX, minY, maxY);

            const bt = bottom.offsetToParent(top);
            const tb = top.offsetToParent(bottom);

            expect(bt.x).toEqual(0);
            expect(bt.y).toEqual(-1);
            expect(bt.z).toEqual(1);
            expect(bt.w).toEqual(1);

            expect(tb.x).toEqual(0);
            expect(tb.y).toEqual(1);
            expect(tb.z).toEqual(1);
            expect(tb.w).toEqual(1);
        });

        it('returns correct results for differently sized ajacent extents', () => {
            const x0 = 10;
            const x1 = 50;
            const x2 = 70;

            const y0 = 10;
            const y1 = 30;
            const y2 = 50;

            // x0           x1     x2
            // +------------+        y2
            // |            |
            // |            |
            // |     L      +------+ y1
            // |            |      |
            // |            |  R   |
            // +------------+------+ y0

            const L = new Extent('foo', x0, x1, y0, y2);
            const R = new Extent('foo', x1, x2, y0, y1);

            const LR = R.offsetToParent(L);

            expect(LR.x).toEqual(1);
            expect(LR.y).toEqual(0);
            expect(LR.z).toEqual(0.5);
            expect(LR.w).toEqual(0.5);
        });
    });

    describe('topLeft, topRight, bottomLeft, bottomRight', () => {
        it('should return the correct values', () => {
            const xmin = -100;
            const xmax = 2323;
            const ymin = -3424;
            const ymax = 901;

            const extent = new Extent('EPSG:3857', xmin, xmax, ymin, ymax);

            const tl = extent.topLeft();
            expect(tl.x()).toEqual(xmin);
            expect(tl.y()).toEqual(ymax);

            const tr = extent.topRight();
            expect(tr.x()).toEqual(xmax);
            expect(tr.y()).toEqual(ymax);

            const bl = extent.bottomLeft();
            expect(bl.x()).toEqual(xmin);
            expect(bl.y()).toEqual(ymin);

            const br = extent.bottomRight();
            expect(br.x()).toEqual(xmax);
            expect(br.y()).toEqual(ymin);
        });
    });

    describe('equals', () => {
        it('should return true if both extent are the same object', () => {
            const extent = new Extent('EPSG:3857', 1, 9, 1, 22);
            expect(extent.equals(extent)).toBeTruthy();
        });

        it('should return true if both extent are equal', () => {
            const extent = new Extent('EPSG:3857', 1, 9, 1, 22);
            const clone = extent.clone();
            expect(extent.equals(clone)).toBeTruthy();
        });

        it('should return false if both extent have different CRSes', () => {
            const a = new Extent('EPSG:foo', 1, 9, 1, 22);
            const b = new Extent('EPSG:bar', 1, 9, 1, 22);
            expect(a.equals(b)).toBeFalsy();
        });

        it('should return false if both extent have different numerical values', () => {
            const a = new Extent('EPSG:3857', 1, 1, 1, 1);
            const b = new Extent('EPSG:3857', 2, 1, 1, 1);
            const c = new Extent('EPSG:3857', 1, 2, 1, 1);
            const d = new Extent('EPSG:3857', 1, 1, 2, 1);
            const e = new Extent('EPSG:3857', 1, 1, 1, 2);

            expect(a.equals(b)).toBeFalsy();
            expect(a.equals(c)).toBeFalsy();
            expect(a.equals(d)).toBeFalsy();
            expect(a.equals(e)).toBeFalsy();
        });

        it('should honor epsilon', () => {
            const xMin = 1;
            const xMax = 2;
            const yMin = 10000;
            const yMax = 20000;
            const original = new Extent('EPSG:3857', xMin, xMax, yMin, yMax);

            const epsilons = [0.1, 0.001, 0.0001, 0.00001, 0.000001];
            for (const epsilon of epsilons) {
                const compared = new Extent(
                    'EPSG:3857',
                    xMin + (epsilon * 0.9),
                    xMax + (epsilon * 0.9),
                    yMin + (epsilon * 0.9),
                    yMax + (epsilon * 0.9),
                );

                expect(original.equals(compared, epsilon)).toEqual(true);
            }
        });
    });

    describe('fitToGrid', () => {
        it('should return the whole grid extent if the grid is 1x1 pixel', () => {
            const gridExtent = new Extent('EPSG:3857', 0, 10, 0, 23);
            const inputExtent = new Extent('EPSG:3857', 1, 9, 1, 22);
            const { extent } = inputExtent.fitToGrid(gridExtent, 1, 1);
            expect(extent).toEqual(gridExtent);
        });
    });

    describe('union', () => {
        it('should update the extent in place', () => {
            const extent1 = new Extent('EPSG:3857', 0, 100, 0, 100);
            const extent2 = new Extent('EPSG:3857', 100, 200, 100, 200);

            expect(extent1.union(extent2)).toBeUndefined();
            expect(extent1).toEqual(new Extent('EPSG:3857', 0, 200, 0, 200));
        });
    });

    describe('fromCenterAndSize', () => {
        it('should return an extent center on the correct coordinate', () => {
            const center = { x: 2324, y: -23254 };
            const extent = Extent.fromCenterAndSize('EPSG:3857', center, 100, 100);

            const newCenter = extent.center() as Coordinates;
            expect(newCenter.x()).toEqual(center.x);
            expect(newCenter.y()).toEqual(center.y);
        });

        it('should return an extent with the correct size', () => {
            const center = { x: 2324, y: -23254 };
            const width = 23921;
            const height = 209023.12;
            const extent = Extent.fromCenterAndSize('EPSG:3857', center, width, height);

            const dims = extent.dimensions();
            expect(dims.x).toEqual(width);
            expect(dims.y).toEqual(height);
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
