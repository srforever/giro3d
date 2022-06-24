import assert from 'assert';
import { Color, Object3D } from 'three';
import GeometryLayer from '../../src/Core/Layer/GeometryLayer.js';

/**
 * Creates a valid {@link GeometryLayer} for unit testing.
 *
 * @param {Object3D} obj3d an optional object3d to inject
 */
function sut(obj3d = undefined) {
    const id = 'foo';
    const object3d = obj3d || {
        isObject3D: true,
    };

    const layer = new GeometryLayer(id, object3d);
    return layer;
}

describe('GeometryLayer', () => {
    describe('constructor', () => {
        it('should throw on undefined id and object3d', () => {
            assert.throws(() => new GeometryLayer(undefined, { isObject3D: true }));
            assert.throws(() => new GeometryLayer('foo', undefined));
            assert.throws(() => new GeometryLayer('foo', { isObject3D: false }));
        });

        it('should assign the provided properties', () => {
            const id = 'foo';
            const obj3d = {
                isObject3D: true,
            };

            const layer = new GeometryLayer(id, obj3d);

            assert.throws(() => { layer.id = 'bar'; }, 'id should be immutable');
            assert.throws(() => { layer.object3d = {}; }, 'object3d should be immutable');

            assert.strictEqual(layer.type, 'geometry');
            assert.strictEqual(layer.object3d, obj3d);
            assert.strictEqual(layer.id, 'foo');
        });

        it('should assign the object3d.name with id if it is a group', () => {
            const id = 'foo';
            const obj3d = {
                isObject3D: true,
                name: '',
                type: 'Group',
            };

            const layer = new GeometryLayer(id, obj3d);

            assert.strictEqual(layer.object3d.name, 'foo');
        });

        it('should define the "opacity" property with default value 1.0', () => {
            const layer = sut();

            assert.strictEqual(layer.opacity, 1.0);
        });

        it('should define the "noTextureOpacity" property with default value 1.0', () => {
            const layer = sut();

            assert.strictEqual(layer.noTextureOpacity, 1.0);
        });

        it('should define the "noTextureColor" property with default value', () => {
            const layer = sut();

            assert.deepEqual(layer.noTextureColor, new Color(0.04, 0.23, 0.35));
        });
    });

    describe('opacity', () => {
        it('should traverse the object3d', () => {
            const o3d = { traverse: jest.fn(), isObject3D: true };
            const layer = sut(o3d);
            layer.opacity = 0.5;
            expect(o3d.traverse).toHaveBeenCalled();
        });
    });
});
