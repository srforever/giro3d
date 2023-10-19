import Extent from '../../../src/core/geographic/Extent';
import TileMesh from '../../../src/core/TileMesh';
import Map from '../../../src/entities/Map.js';

const extent = new Extent('EPSG:3857', 0, 1, 0, 1);
const map = new Map('map', { extent });

describe('TileMesh', () => {
    let defaultMaterial;

    beforeEach(() => {
        defaultMaterial = {
            dispose: jest.fn(),
            setUuid: jest.fn(),
            uniforms: {
                tileDimensions: { value: { set: jest.fn() } },
            },
        };
    });

    describe('constructor', () => {
        it('should register itself to the tile index', () => {
            const mesh = new TileMesh({
                map,
                material: defaultMaterial,
                extent,
                segments: 8,
                coord: { level: 3, x: 1, y: 2 },
            });
            expect(map.tileIndex.tiles.get('1,2,3').deref()).toEqual(mesh);
        });
    });

    describe('dispose', () => {
        it('should dispose the material but NOT the geometry', () => {
            const material = {
                dispose: jest.fn(),
                setUuid: jest.fn(),
                uniforms: {
                    tileDimensions: { value: { set: jest.fn() } },
                },
            };
            const mesh = new TileMesh({
                map,
                material,
                extent,
                segments: 8,
                coord: { level: 0, x: 0, y: 0 },
            });
            const geometry = mesh.geometry;
            geometry.dispose = jest.fn();
            let eventDispatched = false;
            mesh.addEventListener('dispose', () => { eventDispatched = true; });

            mesh.dispose();
            expect(geometry.dispose).not.toHaveBeenCalled();
            expect(material.dispose).toHaveBeenCalledTimes(1);
            expect(eventDispatched).toBeTruthy();
        });
    });

    describe('findCommonAncestor', () => {
        // It is relatively long to create TileMesh on the go (in term of code), so we
        // emulate a fake one with the necessary informations in it.
        function FakeTileMesh(level, parent) {
            this.id = Math.random().toString(36);
            this.level = level;
            this.parent = parent;
        }
        FakeTileMesh.prototype = Object.create({});
        FakeTileMesh.prototype.constructor = FakeTileMesh;
        FakeTileMesh.prototype.findCommonAncestor = TileMesh.prototype.findCommonAncestor;

        const tree = [
            [new FakeTileMesh(0)],
        ];

        beforeAll(() => {
            // root + three levels
            for (let i = 1; i < 4; i++) {
                tree[i] = [];
                // four child per parent
                for (let j = 0; j < 4 ** i; j++) {
                    const tile = new FakeTileMesh(i, tree[i - 1][~~(j / 4)]);
                    tree[i].push(tile);
                }
            }
        });

        it('should find the correct common ancestor between two tiles of same level', () => {
            const res = tree[2][0].findCommonAncestor(tree[2][1]);
            expect(res).toEqual(tree[1][0]);
        });

        it('should find the correct common ancestor between two tiles of different level', () => {
            const res = tree[2][0].findCommonAncestor(tree[3][4]);
            expect(res).toEqual(tree[1][0]);
        });

        it('should find the correct common ancestor between two tiles to be the first one', () => {
            const res = tree[2][0].findCommonAncestor(tree[3][0]);
            expect(res).toEqual(tree[2][0]);
        });

        it('should find the correct common ancestor between two tiles to be the root', () => {
            const res = tree[3][60].findCommonAncestor(tree[2][0]);
            expect(res).toEqual(tree[0][0]);
        });
    });
});
