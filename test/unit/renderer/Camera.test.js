import { OrthographicCamera, PerspectiveCamera } from 'three';
import Camera from '../../../src/renderer/Camera.js';

const DEFAULT_CRS = 'EPSG:1234';

describe('Camera', () => {
    describe('constructor', () => {
        it('should assign properties', () => {
            const width = 123;
            const height = 456;
            const crs = 'EPSG:1234';
            const options = {};
            const camera = new Camera(crs, width, height, options);

            expect(camera.crs).toEqual(crs);
            expect(camera.width).toEqual(width);
            expect(camera.height).toEqual(height);
            expect(camera.camera3D).toBeInstanceOf(PerspectiveCamera);
            expect(camera.camera2D).toBeInstanceOf(OrthographicCamera);
        });
    });

    describe('update', () => {
        it('should update the size', () => {
            const camera = new Camera(DEFAULT_CRS, 0, 0);

            camera.update(123, 456);

            expect(camera.width).toEqual(123);
            expect(camera.height).toEqual(456);
        });
    });
});
