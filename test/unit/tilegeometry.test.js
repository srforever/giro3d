import assert from 'assert';

import Extent from '../../src/Core/Geographic/Extent.js';
import TileGeometry from '../../src/Core/TileGeometry.js';

const extent = new Extent('EPSG:3857', -1000, 1000, -1000, 1000);

// 3x3 square grid
const geometry1 = new TileGeometry({ extent, segment: 2 });
// Actual buffer arrays to prevent regression
const uvsSquare = new Float32Array([
	0, 0,
	0.5, 0,
	1, 0,
	0, 0.5,
	0.5, 0.5,
	1, 0.5,
	0, 1,
	0.5, 1,
	1, 1,
]);
const positionsSquare = new Float32Array([
	-1000, -1000, 0,
	0, -1000, 0,
	1000, -1000, 0,
	-1000, 0, 0,
	0, 0, 0,
	1000, 0, 0,
	-1000, 1000, 0,
	0, 1000, 0,
	1000, 1000, 0,
]);
const indicesSquare = new Uint32Array([
	4, 0, 1,
	4, 3, 0,
    5, 1, 2,
    5, 4, 1,
    7, 3, 4,
    7, 6, 3,
    8, 4, 5,
    8, 7, 4,
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
	-1000, -1000, 0,
	0, -1000, 0,
	1000, -1000, 0,
	-1000, 1000, 0,
	0, 1000, 0,
	1000, 1000, 0,
]);
const indicesRectangle = new Uint32Array([
	4, 0, 1,
	4, 3, 0,
    5, 1, 2,
    5, 4, 1,
]);

describe('TileGeometry', () => {
    it('should have the proper attributes for a 3x3 squared grid given segment=2 parameter', () => {
        assert.deepEqual(geometry1.attributes.position.array, positionsSquare);
        assert.deepEqual(geometry1.attributes.uv.array, uvsSquare);
        assert.deepEqual(geometry1.index.array, indicesSquare);
    });
    it('should have the proper attributes for a 3x2 rectangular grid given width and height', () => {
        assert.deepEqual(geometry2.attributes.position.array, positionsRectangle);
        assert.deepEqual(geometry2.attributes.uv.array, uvsRectangle);
        assert.deepEqual(geometry2.index.array, indicesRectangle);
    });
})