import { Group } from 'three';
import Extent from '../../../src/Core/Geographic/Extent.js';
import { Map } from '../../../src/entities/Map.js';

describe('Map', () => {
    let map;
    const extent = new Extent('EPSG:4326', {
        west: 0, east: 10, south: 0, north: 10,
    });

    beforeEach(() => {
        map = new Map('myEntity', {
            extent,
            maxSubdivisionLevel: 15,
        });
    });

    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new Map(undefined)).toThrow(/Missing id parameter/);
        });

        it('should assign passed values', () => {
            expect(map.maxSubdivisionLevel).toBe(15);
            expect(map.sseScale).toBe(1.5);
            expect(map.validityExtent).toEqual(extent);
            expect(map.protocol).toEqual('tile');
            expect(map.visible).toBe(true);
        });

        it('should create a THREE Group for the object3D property', () => {
            expect(map.object3d).toBeInstanceOf(Group);
        });

        it('defines the update, preUpdate, postUpdate methods', () => {
            expect(map.update).toBeDefined();
            expect(map.preUpdate).toBeDefined();
            expect(map.postUpdate).toBeDefined();
        });
    });
});
