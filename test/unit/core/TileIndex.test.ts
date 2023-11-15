import { Material } from 'three';
import TileIndex, {
    TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT,
    type Tile,
} from '../../../src/core/TileIndex';

class MockWeakRef<T extends WeakKey> implements WeakRef<T> {
    obj: T;
    collected: boolean;

    constructor(obj: T) {
        this.obj = obj;
    }

    [Symbol.toStringTag]: 'WeakRef';

    collect() {
        this.collected = true;
    }

    deref() {
        if (!this.collected) {
            return this.obj;
        }

        return undefined;
    }
}

global.WeakRef = MockWeakRef;

function makeMaterial(visible: boolean) {
    const mat = new Material();
    mat.visible = visible;
    return mat;
}

function makeTile(x: number, y: number, z: number, visible = true, id = 0): Tile {
    return {
        id, x, y, z, material: makeMaterial(visible),
    };
}

describe('TileIndex', () => {
    describe('constructor', () => {
        it('should create a map for the tiles', () => {
            const tileIndex = new TileIndex();
            expect(tileIndex.tiles).toBeInstanceOf(Map);
        });
    });

    describe('addTile', () => {
        it('should keep a WeakRef in the tileIndex at TileMesh creation', () => {
            const tile = makeTile(0, 0, 0);
            const tileIndex = new TileIndex();
            tileIndex.addTile(tile);
            expect(tileIndex.tiles.get('0,0,0').deref()).toBe(tile);
        });

        it('should keep a WeakRef in the tile by ID index at TileMesh creation', () => {
            const foo = makeTile(0, 0, 0, true, 141);
            const bar = makeTile(0, 0, 1, true, 64);
            const tileIndex = new TileIndex();
            tileIndex.addTile(foo);
            tileIndex.addTile(bar);
            expect(tileIndex.getTile(141)).toBe(foo);
            expect(tileIndex.getTile(64)).toBe(bar);
        });
    });

    describe('update', () => {
        it('should only remove garbage collected tiles from the map', () => {
            const tile000 = makeTile(0, 0, 0, true, 141);
            const tile001 = makeTile(0, 0, 1, true, 64);
            const tileIndex = new TileIndex();

            tileIndex.addTile(tile000);
            tileIndex.addTile(tile001);

            const weakref000 = tileIndex.tiles.get('0,0,0');
            const weakref001 = tileIndex.tiles.get('0,0,1');
            expect(weakref000.deref()).toBe(tile000);
            expect(weakref001.deref()).toBe(tile001);
            expect(tileIndex.getTile(141)).toBe(tile000);
            expect(tileIndex.getTile(64)).toBe(tile001);

            (weakref000 as MockWeakRef<Tile>).collect();
            tileIndex.update();
            expect(tileIndex.tiles.get('0,0,0')).toBeUndefined();
            expect(tileIndex.tiles.get('0,0,1')).toBe(weakref001);
            expect(tileIndex.getTile(141)).toBeUndefined();
            expect(tileIndex.getTile(64)).toBe(tile001);
        });
    });

    describe('searchTileOrAncestor', () => {
        it("should return null if the wanted tile isn't in the indexedTiles", () => {
            const tileIndex = new TileIndex();

            expect(tileIndex.searchTileOrAncestor(1, 1, 1)).toBeNull();
        });

        it('should return the requested tile if it is present, and with a visible material', () => {
            const tileIndex = new TileIndex();
            const tile = {
                x: 1, y: 1, z: 1, id: 1, material: makeMaterial(true),
            };
            tileIndex.addTile(tile);

            expect(tileIndex.searchTileOrAncestor(1, 1, 1)).toBe(tile);
        });

        it("should return null if tile's material is not visible", () => {
            const tileIndex = new TileIndex();
            const tile = {
                x: 1, y: 1, z: 1, id: 1, material: makeMaterial(false),
            };
            tileIndex.addTile(tile);

            expect(tileIndex.searchTileOrAncestor(1, 1, 1)).toBeNull();
        });

        it('should return a parent tile (if its visible) if no same level tile found', () => {
            const tileIndex = new TileIndex();
            const tile = {
                x: 0, y: 0, z: 0, id: 1, material: makeMaterial(true),
            };
            tileIndex.addTile(tile);

            expect(tileIndex.searchTileOrAncestor(1, 1, 1)).toBe(tile);
        });
    });

    describe('_getParent', () => {
        it('should return null if coordinate has no parent', () => {
            // Level 0
            expect(TileIndex.getParent(0, 0, 0)).toBeNull();
        });

        it('should return a correct value', () => {
            // Level 1
            expect(TileIndex.getParent(0, 1, 1)).toEqual({ x: 0, y: 0, z: 0 });
            expect(TileIndex.getParent(1, 0, 1)).toEqual({ x: 0, y: 0, z: 0 });
            expect(TileIndex.getParent(0, 0, 1)).toEqual({ x: 0, y: 0, z: 0 });
            expect(TileIndex.getParent(1, 1, 1)).toEqual({ x: 0, y: 0, z: 0 });

            // Level 2
            expect(TileIndex.getParent(0, 0, 2)).toEqual({ x: 0, y: 0, z: 1 });
            expect(TileIndex.getParent(0, 1, 2)).toEqual({ x: 0, y: 0, z: 1 });
            expect(TileIndex.getParent(0, 2, 2)).toEqual({ x: 0, y: 1, z: 1 });
            expect(TileIndex.getParent(0, 3, 2)).toEqual({ x: 0, y: 1, z: 1 });

            expect(TileIndex.getParent(1, 0, 2)).toEqual({ x: 0, y: 0, z: 1 });
            expect(TileIndex.getParent(1, 1, 2)).toEqual({ x: 0, y: 0, z: 1 });
            expect(TileIndex.getParent(1, 2, 2)).toEqual({ x: 0, y: 1, z: 1 });
            expect(TileIndex.getParent(1, 3, 2)).toEqual({ x: 0, y: 1, z: 1 });

            expect(TileIndex.getParent(2, 0, 2)).toEqual({ x: 1, y: 0, z: 1 });
            expect(TileIndex.getParent(2, 1, 2)).toEqual({ x: 1, y: 0, z: 1 });
            expect(TileIndex.getParent(2, 2, 2)).toEqual({ x: 1, y: 1, z: 1 });
            expect(TileIndex.getParent(2, 3, 2)).toEqual({ x: 1, y: 1, z: 1 });

            expect(TileIndex.getParent(3, 0, 2)).toEqual({ x: 1, y: 0, z: 1 });
            expect(TileIndex.getParent(3, 1, 2)).toEqual({ x: 1, y: 0, z: 1 });
            expect(TileIndex.getParent(3, 2, 2)).toEqual({ x: 1, y: 1, z: 1 });
            expect(TileIndex.getParent(3, 3, 2)).toEqual({ x: 1, y: 1, z: 1 });
        });
    });

    describe('getNeighbours', () => {
        it('should return an array of 8 elements', () => {
            const tileIndex = new TileIndex();
            const tile = makeTile(0, 0, 1, true);
            expect(tileIndex.getNeighbours(tile)).toHaveLength(8);
        });

        describe('should return elements in the correct windind order', () => {
            it('should work with arbitrary depth neighbours', () => {
                const tileIndex = new TileIndex();

                //                      +--------+
                //                      |        |
                //                      |   T4   |
                //                      |        |
                //                  +---+--------+
                //                  |T1 |        |
                //                  +---+    T2  |
                //                  |T0 |        |
                //    +-------------+---+--------+--------+
                //    |                 |                 |
                //    |                 |                 |
                //    |                 |                 |
                //    |       T5        |        T3       |
                //    |                 |                 |
                //    |                 |                 |
                //    |                 |                 |
                //    +-----------------+-----------------+

                const T0 = makeTile(3, 4, 3);
                const T1 = makeTile(3, 5, 3);
                const T2 = makeTile(2, 2, 2);
                const T3 = makeTile(1, 0, 1);
                const T4 = makeTile(2, 3, 2);
                const T5 = makeTile(0, 0, 1);

                tileIndex.addTile(T0);
                tileIndex.addTile(T1);
                tileIndex.addTile(T2);
                tileIndex.addTile(T3);
                tileIndex.addTile(T4);
                tileIndex.addTile(T5);

                const t0Neighbours = tileIndex.getNeighbours(T0);

                expect(t0Neighbours[RIGHT]).toBe(T2);
                expect(t0Neighbours[TOP_RIGHT]).toBe(T2);
                expect(t0Neighbours[BOTTOM_RIGHT]).toBe(T3);
                expect(t0Neighbours[TOP]).toBe(T1);
                expect(t0Neighbours[BOTTOM]).toBe(T5);
                expect(t0Neighbours[BOTTOM_LEFT]).toBe(T5);
                expect(t0Neighbours[LEFT]).toBeNull();
                expect(t0Neighbours[TOP_LEFT]).toBeNull();

                const t1Neighbours = tileIndex.getNeighbours(T1);

                expect(t1Neighbours[RIGHT]).toBe(T2);
                expect(t1Neighbours[BOTTOM_RIGHT]).toBe(T2);
                expect(t1Neighbours[TOP_RIGHT]).toBe(T4);
                expect(t1Neighbours[BOTTOM]).toBe(T0);
                expect(t1Neighbours[TOP]).toBeNull();
                expect(t1Neighbours[BOTTOM_LEFT]).toBeNull();
                expect(t1Neighbours[LEFT]).toBeNull();
                expect(t1Neighbours[TOP_LEFT]).toBeNull();

                const t3Neighbours = tileIndex.getNeighbours(T3);

                expect(t3Neighbours[LEFT]).toBe(T5);
                expect(t3Neighbours[RIGHT]).toBeNull();
                expect(t3Neighbours[BOTTOM_RIGHT]).toBeNull();
                expect(t3Neighbours[TOP_RIGHT]).toBeNull();
                expect(t3Neighbours[BOTTOM]).toBeNull();
                expect(t3Neighbours[TOP]).toBeNull();
                expect(t3Neighbours[BOTTOM_LEFT]).toBeNull();
                expect(t3Neighbours[TOP_LEFT]).toBeNull();

                const t5Neighbours = tileIndex.getNeighbours(T5);

                expect(t5Neighbours[RIGHT]).toBe(T3);
                expect(t5Neighbours[LEFT]).toBeNull();
                expect(t5Neighbours[BOTTOM_RIGHT]).toBeNull();
                expect(t5Neighbours[TOP_RIGHT]).toBeNull();
                expect(t5Neighbours[BOTTOM]).toBeNull();
                expect(t5Neighbours[TOP]).toBeNull();
                expect(t5Neighbours[BOTTOM_LEFT]).toBeNull();
                expect(t5Neighbours[TOP_LEFT]).toBeNull();
            });

            it('should work for all neighbours in the same grid level', () => {
                const tileIndex = new TileIndex();

                const x = 2;
                const y = 2;
                const z = 2;

                const tile = makeTile(x, y, z);

                const top = makeTile(x, y + 1, z);
                const topRight = makeTile(x + 1, y + 1, z);
                const topLeft = makeTile(x - 1, y + 1, z);
                const bottomRight = makeTile(x + 1, y - 1, z);
                const bot = makeTile(x, y - 1, z);
                const bottomLeft = makeTile(x - 1, y - 1, z);
                const left = makeTile(x - 1, y, z);
                const right = makeTile(x + 1, y, z);

                tileIndex.addTile(tile);
                tileIndex.addTile(top);
                tileIndex.addTile(bot);
                tileIndex.addTile(left);
                tileIndex.addTile(right);
                tileIndex.addTile(bottomLeft);
                tileIndex.addTile(bottomRight);
                tileIndex.addTile(topRight);
                tileIndex.addTile(topLeft);

                const neighbours = tileIndex.getNeighbours(tile);

                expect(neighbours[TOP]).toBe(top);
                expect(neighbours[RIGHT]).toBe(right);
                expect(neighbours[BOTTOM]).toBe(bot);
                expect(neighbours[LEFT]).toBe(left);

                expect(neighbours[TOP_LEFT]).toBe(topLeft);
                expect(neighbours[TOP_RIGHT]).toBe(topRight);
                expect(neighbours[BOTTOM_LEFT]).toBe(bottomLeft);
                expect(neighbours[BOTTOM_RIGHT]).toBe(bottomRight);
            });
        });
    });
});
