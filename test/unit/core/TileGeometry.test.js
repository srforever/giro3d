import assert from 'assert';

import Extent from '../../../src/Core/Geographic/Extent.js';
import TileGeometry from '../../../src/Core/TileGeometry.js';

const extent = new Extent('EPSG:3857', -100, 100, -100, 100);

// 6x6 square grid
const geometry1 = new TileGeometry({ extent, segment: 5 });
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

const nodata = 0.0;

const fakeData = [
    nodata, nodata, nodata, nodata, nodata, 1.0000,
    nodata, 1.0000, nodata, 1.0000, 1.0000, 1.0000,
    1.0000, 1.5000, 1.0000, nodata, 0.5000, 0.5000,
    nodata, 1.0000, 1.0000, nodata, 0.5000, nodata,
    1.0000, 1.0000, 1.0000, nodata, 1.0000, 1.0000,
    1.0000, 1.0000, 1.0000, 1.0000, 1.0000, nodata,
];

const positionsSquareZ = new Float32Array([
    -100, -100, 0, -60, -100, 0, -20, -100, 0, 20, -100, 0, 60, -100, 0, 100, -100, 1,
    -100, -60, 0, -60, -60, 1, -20, -60, 0, 20, -60, 1, 60, -60, 1, 100, -60, 1,
    -100, -20, 1, -60, -20, 1.5, -20, -20, 1, 20, -20, 0, 60, -20, 0.5, 100, -20, 0.5,
    -100, 20, 0, -60, 20, 1, -20, 20, 1, 20, 20, 0, 60, 20, 0.5, 100, 20, 0,
    -100, 60, 1, -60, 60, 1, -20, 60, 1, 20, 60, 0, 60, 60, 1, 100, 60, 1,
    -100, 100, 1, -60, 100, 1, -20, 100, 1, 20, 100, 1, 60, 100, 1, 100, 100, 0,
]);

const fakeDataB = [
    1.0000, 1.0000, 1.0000, 1.0000, 1.0000, nodata,
    1.0000, 1.0000, 1.0000, nodata, 1.0000, 1.0000,
    nodata, 1.0000, 1.0000, nodata, 0.5000, nodata,
    1.0000, 1.5000, 1.0000, nodata, 0.5000, 0.5000,
    nodata, 1.0000, nodata, 1.0000, 1.0000, 1.0000,
    nodata, nodata, nodata, nodata, nodata, 1.0000,
];

const positionsNoData = new Float32Array([
    100, -100, 1,
    -60, -60, 1, 20, -60, 1, 60, -60, 1, 100, -60, 1,
    -100, -20, 1, -60, -20, 1.5, -20, -20, 1, 60, -20, 0.5, 100, -20, 0.5,
    -60, 20, 1, -20, 20, 1, 60, 20, 0.5,
    -100, 60, 1, -60, 60, 1, -20, 60, 1, 60, 60, 1, 100, 60, 1,
    -100, 100, 1, -60, 100, 1, -20, 100, 1, 20, 100, 1, 60, 100, 1,
]);

const uvsNoData = new Float32Array([
    1, 0,
    0.2, 0.2, 0.6, 0.2, 0.8, 0.2, 1, 0.2,
    0, 0.4, 0.2, 0.4, 0.4, 0.4, 0.8, 0.4, 1, 0.4,
    0.2, 0.6, 0.4, 0.6, 0.8, 0.6,
    0, 0.8, 0.2, 0.8, 0.4, 0.8, 0.8, 0.8, 1, 0.8,
    0, 1, 0.2, 1, 0.4, 1, 0.6, 1, 0.8, 1,
]);

const indicesNoData = new Uint32Array([
    4, 3, 0,
    6, 5, 1, 7, 6, 1, 8, 2, 3, 9, 3, 4, 9, 8, 3,
    10, 5, 6, 11, 6, 7, 11, 10, 6, 12, 8, 9,
    14, 13, 10, 15, 10, 11, 15, 14, 10, 17, 16, 12,
    19, 13, 14, 19, 18, 13, 20, 14, 15, 20, 19, 14, 21, 20, 15, 22, 21, 16, 22, 16, 17,

]);

// 3x2 rectangular grid
const geometry2 = new TileGeometry({ extent, width: 3, height: 2 });
const uvsRectangle = new Float32Array([
    0, 0,
    0.5, 0,
    1, 0,
    0, 1,
    0.5, 1,
    1, 1,
]);
const positionsRectangle = new Float32Array([
    -100, -100, 0,
    0, -100, 0,
    100, -100, 0,
    -100, 100, 0,
    0, 100, 0,
    100, 100, 0,
]);
const indicesRectangle = new Uint32Array([
    4, 0, 1,
    4, 3, 0,
    5, 1, 2,
    5, 4, 1,
]);

const positionsZSimple = new Float32Array([
    -100, -100, 1,
    0, -100, 2,
    100, -100, 3,
    -100, 100, 4,
    0, 100, 5,
    100, 100, 6,
]);

describe('TileGeometry', () => {
    it('should have the proper attributes for a 6x6 squared grid given segment=5 parameter', () => {
        assert.deepEqual(geometry1.attributes.position.array, positionsSquare);
        assert.deepEqual(geometry1.attributes.uv.array, uvsSquare);
        assert.deepEqual(geometry1.index.array, indicesSquare);
    });
    it('should have the proper attributes for a 3x2 rectangular grid given width and height', () => {
        assert.deepEqual(geometry2.attributes.position.array, positionsRectangle);
        assert.deepEqual(geometry2.attributes.uv.array, uvsRectangle);
        assert.deepEqual(geometry2.index.array, indicesRectangle);
    });
    it('should copy a geometry if provided', () => {
        const geometry0 = new TileGeometry({ extent, width: 3, height: 2 });
        const geometry = new TileGeometry({ extent, segment: 2 }, undefined, geometry0);
        assert.deepEqual(geometry.attributes.position.array, positionsRectangle);
        assert.deepEqual(geometry.attributes.uv.array, uvsRectangle);
        assert.deepEqual(geometry.index.array, indicesRectangle);
    });
    it('should handle elevation data with simple approach if no nodata value', () => {
        const elevation = [1, 2, 3, 4, 5, 6];
        const geometry = new TileGeometry({ extent, width: 3, height: 2 }, elevation);
        assert.deepEqual(geometry.attributes.position.array, positionsZSimple);
        assert.deepEqual(geometry.attributes.uv.array, uvsRectangle);
        assert.deepEqual(geometry.index.array, indicesRectangle);
    });
    it('should handle elevation data with simple approach if no data is nodata', () => {
        const elevation = [1, 2, 3, 4, 5, 6];
        const geometry = new TileGeometry({
            extent, width: 3, height: 2, nodata,
        }, elevation);
        assert.deepEqual(geometry.attributes.position.array, positionsZSimple);
        assert.deepEqual(geometry.attributes.uv.array, uvsRectangle);
        assert.deepEqual(geometry.index.array, indicesRectangle);
    });
    it('should handle elevation data with simple approach from top to bottom', () => {
        const elevation1 = [1, 2, 3, 4, 5, 6];
        const geometry = new TileGeometry({
            extent, width: 3, height: 2, nodata, direction: 'bottom',
        }, elevation1);
        const elevation2 = [4, 5, 6, 1, 2, 3];
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < elevation2.length; i++) {
            assert.equal(elevation2[i], positions[i * 3 + 2]);
        }
    });
    it('should empty its buffers when computing with only nodata', () => {
        const geometry = new TileGeometry({ extent, segment: 5, nodata }, new Float32Array(36));
        assert.deepEqual(geometry.attributes.position.array, new Float32Array([]));
        assert.deepEqual(geometry.attributes.uv.array, new Float32Array([]));
        assert.deepEqual(geometry.index.array, new Uint16Array([]));
    });
    it('should have same results from both approaches', () => {
        const geometry = new TileGeometry({ extent, segment: 5, nodata: -1 }, fakeData);
        const positions = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv.array;
        const indices = geometry.index.array;
        assert.deepEqual(positions, positionsSquareZ);
        assert.deepEqual(uvs, uvsSquare);
        assert.deepEqual(indices, indicesSquare);
        geometry.computeBuffersNoData(geometry.props, fakeData);
        assert.deepEqual(geometry.attributes.position.array, positions);
        assert.deepEqual(geometry.attributes.uv.array, uvs);
        assert.deepEqual(geometry.index.array, indices);
    });
    it('should triangulate properly given nodata values', () => {
        const geometry = new TileGeometry({ extent, segment: 5, nodata }, fakeData);
        assert.deepEqual(geometry.attributes.position.array, positionsNoData);
        assert.deepEqual(geometry.attributes.uv.array, uvsNoData);
        assert.deepEqual(geometry.index.array, indicesNoData);
    });
    it('should triangulate properly from top to bottom', () => {
        const geometry = new TileGeometry({
            extent, segment: 5, nodata, direction: 'bottom',
        }, fakeDataB);
        assert.deepEqual(geometry.attributes.position.array, positionsNoData);
        assert.deepEqual(geometry.attributes.uv.array, uvsNoData);
        assert.deepEqual(geometry.index.array, indicesNoData);
    });
});
