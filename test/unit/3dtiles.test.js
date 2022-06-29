import proj4 from 'proj4';
import { Matrix4, Object3D } from 'three';
import Camera from '../../src/Renderer/Camera.js';
import Coordinates from '../../src/Core/Geographic/Coordinates.js';
import { _testing as tested } from '../../src/Process/3dTilesProcessing.js';
import { $3dTilesIndex, configureTile } from '../../src/Provider/3dTilesProvider.js';

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

describe('Distance computation using boundingVolume.box', () => {
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

        tested.calculateCameraDistance(camera.camera3D, tile);

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

        tested.calculateCameraDistance(camera.camera3D, tile);

        expect(tile.distance).toEqual({ max: 90.02464101615138, min: 89.99 });
    });
});

describe('Distance computation using boundingVolume.sphere', () => {
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

        tested.calculateCameraDistance(camera.camera3D, tile);

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

        tested.calculateCameraDistance(camera.camera3D, tile);

        tested.calculateCameraDistance(camera.camera3D, tile);

        // floats...
        expect(tile.distance.min).toBeCloseTo(89.99, 12);
        expect(tile.distance.max).toBeCloseTo(90.01, 12);
    });
});
