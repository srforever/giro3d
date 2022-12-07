import assert from 'assert';
import { Color, Object3D } from 'three';
import Entity3D from '../../../src/entities/Entity3D.js';

/**
 * Creates a valid {@link Entity3D} for unit testing.
 *
 * @param {Object3D} obj3d an optional object3d to inject
 */
function sut(obj3d = undefined) {
    const id = 'foo';
    const object3d = obj3d || {
        isObject3D: true,
    };

    const entity = new Entity3D(id, object3d);
    return entity;
}

describe('Entity3D', () => {
    describe('constructor', () => {
        it('should throw on undefined id and object3d', () => {
            assert.throws(() => new Entity3D(undefined, { isObject3D: true }));
            assert.throws(() => new Entity3D('foo', undefined));
            assert.throws(() => new Entity3D('foo', { isObject3D: false }));
        });

        it('should assign the provided properties', () => {
            const id = 'foo';
            const obj3d = {
                isObject3D: true,
            };

            const entity = new Entity3D(id, obj3d);

            assert.throws(() => { entity.id = 'bar'; }, 'id should be immutable');
            assert.throws(() => { entity.object3d = {}; }, 'object3d should be immutable');

            assert.strictEqual(entity.type, 'geometry');
            assert.strictEqual(entity.object3d, obj3d);
            assert.strictEqual(entity.id, 'foo');
        });

        it('should assign the object3d.name with id if it is a group', () => {
            const id = 'foo';
            const obj3d = {
                isObject3D: true,
                name: '',
                type: 'Group',
            };

            const entity = new Entity3D(id, obj3d);

            assert.strictEqual(entity.object3d.name, 'foo');
        });

        it('should define the "opacity" property with default value 1.0', () => {
            const entity = sut();

            assert.strictEqual(entity.opacity, 1.0);
        });

        it('should define the "noTextureColor" property with default value', () => {
            const entity = sut();

            assert.deepEqual(entity.noTextureColor, new Color(0.04, 0.23, 0.35));
        });
    });

    describe('mixin from EventDispatcher', () => {
        it('contains the dispatchEvent method', () => {
            const entity = sut();
            expect(entity.dispatchEvent).toBeDefined();
        });

        it('contains the addEventListener method', () => {
            const entity = sut();
            expect(entity.addEventListener).toBeDefined();
        });

        it('contains the hasEventListener method', () => {
            const entity = sut();
            expect(entity.hasEventListener).toBeDefined();
        });

        it('contains the removeEventListener method', () => {
            const entity = sut();
            expect(entity.removeEventListener).toBeDefined();
        });

        it('should dispatch the opacity-property-changed event', () => {
            const o3d = { traverse: jest.fn(), isObject3D: true };
            const entity = sut(o3d);
            const listener = jest.fn();

            entity.addEventListener('opacity-property-changed', listener);
            entity.opacity = 0;
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('opacity', () => {
        it('should traverse the object3d', () => {
            const o3d = { traverse: jest.fn(), isObject3D: true };
            const entity = sut(o3d);
            entity.opacity = 0.5;
            expect(o3d.traverse).toHaveBeenCalled();
        });
    });

    describe('attach', () => {
        function makeLayer() {
            const layer = { update: jest.fn(), _preprocessLayer: () => layer };
            return layer;
        }

        it('should assign a default image size if none is present', () => {
            const entity = sut();
            const layer1 = makeLayer();
            entity.attach(layer1);

            expect(layer1.imageSize).toEqual({ w: 256, h: 256 });

            const layer2 = makeLayer();
            layer2.imageSize = { w: 3, h: 114 };
            entity.attach(layer2);
            expect(layer2.imageSize).toEqual({ w: 3, h: 114 });
        });
    });
});
