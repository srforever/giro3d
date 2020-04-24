import assert from 'assert';
import Camera from '../../src/Renderer/Camera.js';

describe('preSSE checks', () => {
    it('should increase when fov decrease', () => {
        const camera = new Camera('', 100, 50);

        camera.update(100, 50);
        const initial = camera._preSSE;

        camera.camera3D.fov *= 0.5;
        camera.update(100, 50);

        assert.ok(camera._preSSE > initial);
    });
});
