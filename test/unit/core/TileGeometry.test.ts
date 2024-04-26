import Extent from 'src/core/geographic/Extent';
import HeightMap from 'src/core/HeightMap';
import OffsetScale from 'src/core/OffsetScale';
import TileGeometry from 'src/core/TileGeometry';
import { FloatType, RGFormat } from 'three';

const dimensions = new Extent('EPSG:3857', -100, 100, -100, 100).dimensions();
const DEFAULT_OFFSET_SCALE = new OffsetScale(0, 0, 1, 1);

// Actual buffer arrays to prevent regression
const uvsSquare = new Float32Array([
    0, 0, 0.2, 0, 0.4, 0, 0.6, 0, 0.8, 0, 1, 0, 0, 0.2, 0.2, 0.2, 0.4, 0.2, 0.6, 0.2, 0.8, 0.2, 1,
    0.2, 0, 0.4, 0.2, 0.4, 0.4, 0.4, 0.6, 0.4, 0.8, 0.4, 1, 0.4, 0, 0.6, 0.2, 0.6, 0.4, 0.6, 0.6,
    0.6, 0.8, 0.6, 1, 0.6, 0, 0.8, 0.2, 0.8, 0.4, 0.8, 0.6, 0.8, 0.8, 0.8, 1, 0.8, 0, 1, 0.2, 1,
    0.4, 1, 0.6, 1, 0.8, 1, 1, 1,
]);
const positionsSquare = new Float32Array([
    -100, -100, 0, -60, -100, 0, -20, -100, 0, 20, -100, 0, 60, -100, 0, 100, -100, 0, -100, -60, 0,
    -60, -60, 0, -20, -60, 0, 20, -60, 0, 60, -60, 0, 100, -60, 0, -100, -20, 0, -60, -20, 0, -20,
    -20, 0, 20, -20, 0, 60, -20, 0, 100, -20, 0, -100, 20, 0, -60, 20, 0, -20, 20, 0, 20, 20, 0, 60,
    20, 0, 100, 20, 0, -100, 60, 0, -60, 60, 0, -20, 60, 0, 20, 60, 0, 60, 60, 0, 100, 60, 0, -100,
    100, 0, -60, 100, 0, -20, 100, 0, 20, 100, 0, 60, 100, 0, 100, 100, 0,
]);

const indicesSquare = new Uint16Array([
    7, 0, 1, 7, 6, 0, 8, 1, 2, 8, 7, 1, 9, 2, 3, 9, 8, 2, 10, 3, 4, 10, 9, 3, 11, 4, 5, 11, 10, 4,
    13, 6, 7, 13, 12, 6, 14, 7, 8, 14, 13, 7, 15, 8, 9, 15, 14, 8, 16, 9, 10, 16, 15, 9, 17, 10, 11,
    17, 16, 10, 19, 12, 13, 19, 18, 12, 20, 13, 14, 20, 19, 13, 21, 14, 15, 21, 20, 14, 22, 15, 16,
    22, 21, 15, 23, 16, 17, 23, 22, 16, 25, 18, 19, 25, 24, 18, 26, 19, 20, 26, 25, 19, 27, 20, 21,
    27, 26, 20, 28, 21, 22, 28, 27, 21, 29, 22, 23, 29, 28, 22, 31, 24, 25, 31, 30, 24, 32, 25, 26,
    32, 31, 25, 33, 26, 27, 33, 32, 26, 34, 27, 28, 34, 33, 27, 35, 28, 29, 35, 34, 28,
]);

describe('TileGeometry', () => {
    it('should have the proper attributes for a 6x6 squared grid given segment=5 parameter', () => {
        const geometry = new TileGeometry({ dimensions, segments: 5 });

        expect(geometry.attributes.position.array).toStrictEqual(positionsSquare);
        expect(geometry.attributes.uv.array).toStrictEqual(uvsSquare);
        expect(geometry.index.array).toStrictEqual(indicesSquare);
    });

    it('should create an index buffer with 16bit numbers if possible', () => {
        const small = new TileGeometry({ dimensions, segments: 5 });
        const big = new TileGeometry({ dimensions, segments: 200 });

        expect(small.getIndex().array.BYTES_PER_ELEMENT).toEqual(2);
        expect(big.getIndex().array.BYTES_PER_ELEMENT).toEqual(4);
    });

    describe('resetHeights', () => {
        it('should set all Z coordinates to zero', () => {
            const geometry = new TileGeometry({ dimensions, segments: 3 });
            const positions = geometry.getAttribute('position');
            for (let i = 0; i < positions.count; i++) {
                positions.setZ(i, 999);
            }
            geometry.resetHeights();

            for (let i = 0; i < positions.count; i++) {
                expect(positions.getZ(i)).toEqual(0);
            }
        });
    });

    describe('applyHeightMap', () => {
        it('should return the min/max height of computed vertices', () => {
            const width = 2;
            const height = 2;
            const buffer = new Float32Array(width * height * 2);

            const ALPHA = 1;
            buffer[0] = -102;
            buffer[1] = ALPHA;
            buffer[2] = 989;
            buffer[3] = ALPHA;
            buffer[4] = 600;
            buffer[5] = ALPHA;
            buffer[6] = 800;
            buffer[7] = ALPHA;

            const grid_2x2 = new TileGeometry({ dimensions, segments: 2 });

            const { min, max } = grid_2x2.applyHeightMap(
                new HeightMap(buffer, width, height, DEFAULT_OFFSET_SCALE, RGFormat, FloatType),
            );

            expect(min).toEqual(-102);
            expect(max).toEqual(989);
        });

        it('should correctly sample the buffer', () => {
            const small = new TileGeometry({ dimensions, segments: 2 });

            // Create 2x2 heightmap, with a stride of 2 (the elevation is in the even indices)
            const width = 2;
            const height = 2;
            const buffer = new Float32Array(width * height * 2);

            const ALPHA = 1;
            buffer[0] = 200;
            buffer[1] = ALPHA;
            buffer[2] = 400;
            buffer[3] = ALPHA;
            buffer[4] = 600;
            buffer[5] = ALPHA;
            buffer[6] = 800;
            buffer[7] = ALPHA;

            // The heightmap looks like this:
            //
            // +-----+-----+
            // | 200 | 400 |
            // +-----+-----+
            // | 600 | 800 |
            // +-----+-----+

            // The grid looks like this:
            //
            // 0 --- 1 --- 2
            // |     |     |
            // 3 --- 4 --- 5
            // |     |     |
            // 6 --- 7 --- 8

            const heightMap = new HeightMap(
                buffer,
                width,
                height,
                DEFAULT_OFFSET_SCALE,
                RGFormat,
                FloatType,
            );
            small.applyHeightMap(heightMap);

            const positions = small.getAttribute('position');

            // Top row
            expect(positions.getZ(0)).toEqual(200);
            expect(positions.getZ(1)).toEqual(200);
            expect(positions.getZ(2)).toEqual(400);

            // Middle row
            expect(positions.getZ(3)).toEqual(200);
            expect(positions.getZ(4)).toEqual(200);
            expect(positions.getZ(5)).toEqual(400);

            // Bottom row
            expect(positions.getZ(6)).toEqual(600);
            expect(positions.getZ(7)).toEqual(600);
            expect(positions.getZ(8)).toEqual(800);
        });
    });
});
