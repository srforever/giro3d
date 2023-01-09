import proj4 from 'proj4';
import { Matrix4, Object3D } from 'three';
import Tiles3D, { calculateCameraDistance } from '../../../src/entities/Tiles3D.js';
import Camera from '../../../src/renderer/Camera.js';
import Coordinates from '../../../src/core/geographic/Coordinates.js';
import { $3dTilesIndex, configureTile } from '../../../src/provider/3dTilesProvider.js';
import Tiles3DSource from '../../../src/sources/Tiles3DSource.js';

describe('Tiles3D', () => {
    const defaultSource = new Tiles3DSource('http://example.com/tileset');

    describe('constructor', () => {
        it('should throw on falsy identifier', () => {
            expect(() => new Tiles3D()).toThrow(/Missing id parameter/);
            expect(() => new Tiles3D(undefined)).toThrow(/Missing id parameter/);
            expect(() => new Tiles3D('')).toThrow(/Missing id parameter/);
            expect(() => new Tiles3D(null)).toThrow(/Missing id parameter/);
        });

        it('should assign the protocol to 3d-tiles', () => {
            const sut = new Tiles3D('foo', defaultSource);
            expect(sut.protocol).toBe('3d-tiles');
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
        camera.camera3D.position.copy(new Coordinates('EPSG:3946', 0, 0, 100).xyz());
        camera.camera3D.updateMatrixWorld(true);

        it('should compute distance correctly', () => {
            const tileset = tilesetWithBox();
            const tileIndex = new $3dTilesIndex(tileset, '');

            const tile = new Object3D();
            configureTile(tile, { }, tileIndex.index['1']);

            calculateCameraDistance(camera.camera3D, tile);

            expect(tile.distance).toEqual({ min: 99, max: 102.46410161513775 });
        });

        it('should affected by transform', () => {
            const m = new Matrix4().makeTranslation(0, 0, 10).multiply(
                new Matrix4().makeScale(0.01, 0.01, 0.01),
            );
            const tileset = tilesetWithBox(m);

            const tileIndex = new $3dTilesIndex(tileset, '');

            const tile = new Object3D();
            configureTile(tile, { }, tileIndex.index['1']);

            calculateCameraDistance(camera.camera3D, tile);

            expect(tile.distance).toEqual({ max: 90.02464101615138, min: 89.99 });
        });
    });

    describe('calculateCameraDistance sphere volumes', () => {
        proj4.defs('EPSG:3946',
            '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

        const camera = new Camera('EPSG:3946', 100, 100);
        camera.camera3D.position.copy(new Coordinates('EPSG:3946', 0, 0, 100).xyz());
        camera.camera3D.updateMatrixWorld(true);

        it('should compute distance correctly', () => {
            const tileset = tilesetWithSphere();
            const tileIndex = new $3dTilesIndex(tileset, '');

            const tile = new Object3D();
            configureTile(tile, { }, tileIndex.index['1']);

            calculateCameraDistance(camera.camera3D, tile);

            expect(tile.distance).toEqual({ max: 101, min: 99 });
        });

        it('should affected by transform', () => {
            const m = new Matrix4().makeTranslation(0, 0, 10).multiply(
                new Matrix4().makeScale(0.01, 0.01, 0.01),
            );
            const tileset = tilesetWithSphere(m);

            const tileIndex = new $3dTilesIndex(tileset, '');

            const tile = new Object3D();
            configureTile(tile, { }, tileIndex.index['1']);

            calculateCameraDistance(camera.camera3D, tile);

            calculateCameraDistance(camera.camera3D, tile);

            // floats...
            expect(tile.distance.min).toBeCloseTo(89.99, 12);
            expect(tile.distance.max).toBeCloseTo(90.01, 12);
        });
    });
});
