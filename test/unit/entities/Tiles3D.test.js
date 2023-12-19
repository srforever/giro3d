import '../setup.js';
import assert from 'assert';
import proj4 from 'proj4';
import {
    Group, Matrix4, Mesh,
} from 'three';
import Tiles3D from '../../../src/entities/Tiles3D';
import $3dTilesIndex from '../../../src/entities/3dtiles/3dTilesIndex';
import Tile from '../../../src/entities/3dtiles/Tile';
import Camera from '../../../src/renderer/Camera.js';
import Coordinates from '../../../src/core/geographic/Coordinates';
import Tiles3DSource from '../../../src/sources/Tiles3DSource';
import Entity3D from '../../../src/entities/Entity3D';

describe('Tiles3D', () => {
    const defaultSource = new Tiles3DSource('http://example.com/tileset');
    const defaultEntity = new Entity3D('foo', new Group());

    describe('constructor', () => {
        it('should throw on falsy identifier', () => {
            expect(() => new Tiles3D()).toThrow(/Missing id parameter/);
            expect(() => new Tiles3D(undefined)).toThrow(/Missing id parameter/);
            expect(() => new Tiles3D('')).toThrow(/Missing id parameter/);
            expect(() => new Tiles3D(null)).toThrow(/Missing id parameter/);
        });

        it('should assign the source', () => {
            const sut = new Tiles3D('foo', new Tiles3DSource('http://example.com/tileset'));
            expect(sut.url).toBe('http://example.com/tileset');
        });

        it('should assign default values if options do not provide them', () => {
            const sut = new Tiles3D('foo', defaultSource);
            expect(sut.sseThreshold).toBe(16);
            expect(sut.cleanupDelay).toBe(1000);
        });
    });

    function tilesetWithBox(transformMatrix) {
        const tileset = {
            root: {
                boundingVolume: {
                    box: [
                        0, 0, 0,
                        1, 0, 0,
                        0, 1, 0,
                        0, 0, 1],
                },
            },
        };
        if (transformMatrix) {
            tileset.root.transform = transformMatrix.elements;
        }
        return tileset;
    }

    function tilesetWithSphere(transformMatrix) {
        const tileset = {
            root: {
                boundingVolume: {
                    sphere: [0, 0, 0, 1],
                },
            },
        };
        if (transformMatrix) {
            tileset.root.transform = transformMatrix.elements;
        }
        return tileset;
    }

    describe('calculateCameraDistance with box volumes', () => {
        proj4.defs('EPSG:3946',
            '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

        const camera = new Camera('EPSG:3946', 100, 100);
        camera.camera3D.position.copy(new Coordinates('EPSG:3946', 0, 0, 100).toVector3());
        camera.camera3D.updateMatrixWorld(true);

        it('should compute distance correctly', () => {
            const tileset = tilesetWithBox();
            const tileIndex = new $3dTilesIndex(tileset, '');

            const tile = new Tile(defaultEntity, tileIndex.index['1']);

            tile.calculateCameraDistance(camera.camera3D);

            expect(tile.distance).toEqual({ min: 99, max: 102.46410161513775 });
        });

        it('should affected by transform', () => {
            const m = new Matrix4().makeTranslation(0, 0, 10).multiply(
                new Matrix4().makeScale(0.01, 0.01, 0.01),
            );
            const tileset = tilesetWithBox(m);

            const tileIndex = new $3dTilesIndex(tileset, '');

            const tile = new Tile(defaultEntity, tileIndex.index['1']);

            tile.calculateCameraDistance(camera.camera3D);

            expect(tile.distance).toEqual({ max: 90.02464101615138, min: 89.99 });
        });
    });

    describe('calculateCameraDistance sphere volumes', () => {
        proj4.defs('EPSG:3946',
            '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

        const camera = new Camera('EPSG:3946', 100, 100);
        camera.camera3D.position.copy(new Coordinates('EPSG:3946', 0, 0, 100).toVector3());
        camera.camera3D.updateMatrixWorld(true);

        it('should compute distance correctly', () => {
            const tileset = tilesetWithSphere();
            const tileIndex = new $3dTilesIndex(tileset, '');

            const tile = new Tile(defaultEntity, tileIndex.index['1']);

            tile.calculateCameraDistance(camera.camera3D);

            expect(tile.distance).toEqual({ max: 101, min: 99 });
        });

        it('should affected by transform', () => {
            const m = new Matrix4().makeTranslation(0, 0, 10).multiply(
                new Matrix4().makeScale(0.01, 0.01, 0.01),
            );
            const tileset = tilesetWithSphere(m);

            const tileIndex = new $3dTilesIndex(tileset, '');

            const tile = new Tile(defaultEntity, tileIndex.index['1']);

            tile.calculateCameraDistance(camera.camera3D);

            tile.calculateCameraDistance(camera.camera3D);

            // floats...
            expect(tile.distance.min).toBeCloseTo(89.99, 12);
            expect(tile.distance.max).toBeCloseTo(90.01, 12);
        });
    });

    describe('getObjectToUpdateForAttachedLayers', () => {
        it('should correctly return all children', () => {
            const layer = { };
            const tile = {
                content: new Group(),
                layer,
            };

            for (let i = 0; i < 3; i++) {
                const mesh = new Mesh();
                mesh.layer = layer;
                tile.content.add(mesh);
            }

            const tiles3D = new Tiles3D('foo', defaultSource);

            const result = tiles3D.getObjectToUpdateForAttachedLayers(tile);
            assert.ok(Array.isArray(result.elements));
            assert.ok(result.elements.length, 3);
        });
    });
});
