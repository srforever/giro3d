import assert from 'assert';

import Extent from '../../../src/core/geographic/Extent';
import TileGeometry from '../../../src/core/TileGeometry.js';

const dimensions = new Extent('EPSG:3857', -100, 100, -100, 100).dimensions();

// 6x6 square grid
const geometry1 = new TileGeometry({ dimensions, segments: 5 });
// Actual buffer arrays to prevent regression
const uvsSquare = new Float32Array([
    0, 0, 0.2, 0, 0.4, 0, 0.6, 0, 0.8, 0, 1, 0,
    0, 0.2, 0.2, 0.2, 0.4, 0.2, 0.6, 0.2, 0.8, 0.2, 1, 0.2,
    0, 0.4, 0.2, 0.4, 0.4, 0.4, 0.6, 0.4, 0.8, 0.4, 1, 0.4,
    0, 0.6, 0.2, 0.6, 0.4, 0.6, 0.6, 0.6, 0.8, 0.6, 1, 0.6,
    0, 0.8, 0.2, 0.8, 0.4, 0.8, 0.6, 0.8, 0.8, 0.8, 1, 0.8,
    0, 1, 0.2, 1, 0.4, 1, 0.6, 1, 0.8, 1, 1, 1,
]);
const positionsSquare = new Float32Array([
    -100, -100, 0, -60, -100, 0, -20, -100, 0, 20, -100, 0, 60, -100, 0, 100, -100, 0,
    -100, -60, 0, -60, -60, 0, -20, -60, 0, 20, -60, 0, 60, -60, 0, 100, -60, 0,
    -100, -20, 0, -60, -20, 0, -20, -20, 0, 20, -20, 0, 60, -20, 0, 100, -20, 0,
    -100, 20, 0, -60, 20, 0, -20, 20, 0, 20, 20, 0, 60, 20, 0, 100, 20, 0,
    -100, 60, 0, -60, 60, 0, -20, 60, 0, 20, 60, 0, 60, 60, 0, 100, 60, 0,
    -100, 100, 0, -60, 100, 0, -20, 100, 0, 20, 100, 0, 60, 100, 0, 100, 100, 0,
]);

const indicesSquare = new Uint32Array([
    7, 0, 1, 7, 6, 0, 8, 1, 2, 8, 7, 1, 9, 2, 3, 9, 8, 2, 10, 3, 4, 10, 9,
    3, 11, 4, 5, 11, 10, 4, 13, 6, 7, 13, 12, 6, 14, 7, 8, 14, 13, 7, 15,
    8, 9, 15, 14, 8, 16, 9, 10, 16, 15, 9, 17, 10, 11, 17, 16, 10, 19, 12,
    13, 19, 18, 12, 20, 13, 14, 20, 19, 13, 21, 14, 15, 21, 20, 14, 22, 15,
    16, 22, 21, 15, 23, 16, 17, 23, 22, 16, 25, 18, 19, 25, 24, 18, 26, 19,
    20, 26, 25, 19, 27, 20, 21, 27, 26, 20, 28, 21, 22, 28, 27, 21, 29, 22,
    23, 29, 28, 22, 31, 24, 25, 31, 30, 24, 32, 25, 26, 32, 31, 25, 33, 26,
    27, 33, 32, 26, 34, 27, 28, 34, 33, 27, 35, 28, 29, 35, 34, 28,
]);

describe('TileGeometry', () => {
    it('should have the proper attributes for a 6x6 squared grid given segment=5 parameter', () => {
        assert.deepEqual(geometry1.attributes.position.array, positionsSquare);
        assert.deepEqual(geometry1.attributes.uv.array, uvsSquare);
        assert.deepEqual(geometry1.index.array, indicesSquare);
    });
});
