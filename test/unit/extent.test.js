import assert from 'assert';
import { Box3, Vector3 } from 'three';
import Coordinates from '../../src/Core/Geographic/Coordinates.js';
import Extent from '../../src/Core/Geographic/Extent.js';

describe('Extent constructors', () => {
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
