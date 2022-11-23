import { Vector3 } from 'three';

import Extent from '../../../src/Core/Geographic/Extent.js';
import Map from '../../../src/entities/Map.js';
import OBB from '../../../src/Renderer/ThreeExtended/OBB.js';
import TileIndex from '../../../src/Core/TileIndex.js';
import TileMesh from '../../../src/Core/TileMesh.js';

const NORTH = 0;
const NORTH_EAST = 1;
const EAST = 2;
const SOUTH_EAST = 3;
const SOUTH = 4;
const SOUTH_WEST = 5;
const WEST = 6;
const NORTH_WEST = 7;

const extent = new Extent('foo', 0, 1, 0, 1);
const map = new Map('map', { extent });
const material = {
    setUuid: jest.fn(),
    uniforms: {
        tileDimensions: { value: { set: jest.fn() } },
    },
};
const obb = new OBB(new Vector3(), new Vector3());
const geometry = { dispose: jest.fn(), OBB: { clone: () => obb } };

describe('TileIndex', () => {
    it('should be present on a Map', () => {
        const tileIndex = new TileIndex();
        expect(map.tileIndex).toEqual(tileIndex);
    });
    it('should update the a Map.tileIndex.indexedTiles at TileMesh creation', () => {
        const mesh = new TileMesh(map, geometry, material, extent, 3, 1, 2);
        expect(map.tileIndex.indexedTiles.get('1,2,3').deref()).toEqual(mesh);
    });

    describe('constructor', () => {
        it('should initiate an indexedTiles object', () => {
            const tileIndex = new TileIndex();
            expect(tileIndex.indexedTiles).toBeDefined();
        });
    });

    describe('addTile', () => {
        it('should keep a reference in the tileIndex at TileMesh creation', () => {
            const mesh = new TileMesh(map, geometry, material, extent, 0, 0, 0);
            const key = `${mesh.x},${mesh.y},${mesh.z}`;
            expect(map.tileIndex.indexedTiles.get(key)).toBeDefined();
        });
    });

    describe('_makeKey', () => {
        const x = 1;
        const y = 2;
        const z = 3;
        const tileIndex = new TileIndex();
        it('should make a key for the NORTH neighbor', () => {
            tileIndex.neighbour = NORTH;
            expect(tileIndex._makeKey(x, y, z)).toEqual('1,3,3');
        });
        it('should make a key for the NORTH_EAST neighbor', () => {
            tileIndex.neighbour = NORTH_EAST;
            expect(tileIndex._makeKey(x, y, z)).toEqual('2,3,3');
        });
        it('should make a key for the EAST neighbor', () => {
            tileIndex.neighbour = EAST;
            expect(tileIndex._makeKey(x, y, z)).toEqual('2,2,3');
        });
        it('should make a key for the SOUTH_EAST neighbor', () => {
            tileIndex.neighbour = SOUTH_EAST;
            expect(tileIndex._makeKey(x, y, z)).toEqual('2,1,3');
        });
        it('should make a key for the SOUTH neighbor', () => {
            tileIndex.neighbour = SOUTH;
            expect(tileIndex._makeKey(x, y, z)).toEqual('1,1,3');
        });
        it('should make a key for the SOUTH_WEST neighbor', () => {
            tileIndex.neighbour = SOUTH_WEST;
            expect(tileIndex._makeKey(x, y, z)).toEqual('0,1,3');
        });
        it('should make a key for the WEST neighbor', () => {
            tileIndex.neighbour = WEST;
            expect(tileIndex._makeKey(x, y, z)).toEqual('0,2,3');
        });
        it('should make a key for the NORTH_WEST neighbor', () => {
            tileIndex.neighbour = NORTH_WEST;
            expect(tileIndex._makeKey(x, y, z)).toEqual('0,3,3');
        });
        it('should default to null', () => {
            tileIndex.neighbour = 'foo';
            expect(tileIndex._makeKey(x, y, z)).toEqual(null);
        });
    });

    describe('_searchNeighbour', () => {
        const x = 1;
        const y = 2;
        const z = 3;
        it("should return false if the wanted neighbor isn't in the indexedTiles", () => {
            map.tileIndex.neighbour = EAST;
            expect(map.tileIndex._searchNeighbour(x, y, z, [])).toEqual(false);
        });
        it('should empty the weakref in the indexedTiles if no neighbor', () => {
            map.tileIndex.neighbour = WEST;
            map.tileIndex.indexedTiles.set('0,2,3', new WeakRef({})); // eslint-disable-line no-undef
            map.tileIndex._searchNeighbour(x, y, z, []);
            expect(map.tileIndex.indexedTiles.get('0,2,3')).toEqual(undefined);
        });
        it("should return the wanted same level tile if it's in the indexedTiles", () => {
            map.tileIndex.neighbour = WEST;
            const neighbors = [null, null, null, null, null, null, null, null];
            const mesh = new TileMesh(map, geometry, material, extent, 3, 0, 2);
            mesh.material.visible = true;
            expect(map.tileIndex._searchNeighbour(x, y, z, neighbors)).toEqual(true);
            expect(neighbors).toEqual([null, null, null, null, null, null, mesh, null]);
        });
        it('should empty the weakref if neighbor has no material', () => {
            map.tileIndex.neighbour = WEST;
            const mesh = new TileMesh(map, geometry, material, extent, 3, 0, 2);
            mesh.material = undefined;
            expect(map.tileIndex._searchNeighbour(x, y, z, [])).toEqual(false);
            expect(map.tileIndex.indexedTiles.get('0,2,3')).toEqual(undefined);
        });
        it("should return false if neighbor's material is not visible", () => {
            map.tileIndex.neighbour = WEST;
            const mesh = new TileMesh(map, geometry, material, extent, 3, 0, 2);
            mesh.material.visible = false;
            expect(map.tileIndex.indexedTiles.get('0,2,3').deref()).toEqual(mesh);
            expect(map.tileIndex._searchNeighbour(x, y, z, [])).toEqual(false);
        });
        it('should return a parent tile if no same level tile found', () => {
            map.tileIndex.neighbour = EAST;
            const neighbors = [null, null, null, null, null, null, null, null];
            const mesh = new TileMesh(map, geometry, material, extent, 1, 1, 0);
            mesh.material.visible = true;
            expect(map.tileIndex._searchNeighbour(x, y, z, neighbors)).toEqual(true);
            expect(neighbors).toEqual([null, null, mesh, null, null, null, null, null]);
        });
    });

    describe('getNeighbours', () => {
        it('should return null if no neighbors found', () => {
            const mesh = new TileMesh(map, geometry, material, extent, 0, 0, 0);
            expect(map.tileIndex.getNeighbours(mesh)).toEqual(null);
        });
        it('should return all same level neighbors', () => {
            map.tileIndex.indexedTiles.clear();
            const mesh = new TileMesh(map, geometry, material, extent, 2, 1, 1);
            const mesh0 = new TileMesh(map, geometry, material, extent, 2, 1, 2);
            const mesh1 = new TileMesh(map, geometry, material, extent, 2, 2, 2);
            const mesh2 = new TileMesh(map, geometry, material, extent, 2, 2, 1);
            const mesh3 = new TileMesh(map, geometry, material, extent, 2, 2, 0);
            const mesh4 = new TileMesh(map, geometry, material, extent, 2, 1, 0);
            const mesh5 = new TileMesh(map, geometry, material, extent, 2, 0, 0);
            const mesh6 = new TileMesh(map, geometry, material, extent, 2, 0, 1);
            const mesh7 = new TileMesh(map, geometry, material, extent, 2, 0, 2);
            material.visible = true;
            expect(map.tileIndex.getNeighbours(mesh)).toEqual([
                mesh0, mesh1, mesh2, mesh3, mesh4, mesh5, mesh6, mesh7,
            ]);
        });
        it('should return all appropriate neighbors', () => {
            map.tileIndex.indexedTiles.clear();
            const mat = {
                setUuid: jest.fn(),
                uniforms: {
                    tileDimensions: { value: { set: jest.fn() } },
                },
            };
            const m = new TileMesh(map, geometry, material, extent, 2, 1, 2);
            const m45 = new TileMesh(map, geometry, material, extent, 1, 0, 0);
            const m0 = new TileMesh(map, geometry, material, extent, 2, 1, 3);
            const m12 = new TileMesh(map, geometry, material, extent, 1, 1, 1);
            const m3 = new TileMesh(map, geometry, mat, extent, 1, 1, 0);
            expect(m3.material.visible).toEqual(false);
            const m7 = new TileMesh(map, geometry, material, extent, 2, 0, 3);
            const m6 = new TileMesh(map, geometry, material, extent, 2, 0, 2);
            material.visible = true;
            expect(map.tileIndex.getNeighbours(m)).toEqual([
                m0, m12, m12, null, m45, m45, m6, m7,
            ]);
        });
    });
});
