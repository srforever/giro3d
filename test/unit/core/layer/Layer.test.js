import Layer from '../../../../src/core/layer/Layer.js';
import Extent from '../../../../src/core/geographic/Extent.js';
import { setupGlobalMocks } from '../../mocks.js';
import NullSource from '../../../../src/sources/NullSource.js';

describe('Layer', () => {
    beforeEach(() => {
        setupGlobalMocks();
    });

    describe('progress & loading', () => {
        it('should return the progress and loading of the underlying queue', () => {
            const layer = new Layer('foo', { source: new NullSource() });

            expect(layer.progress).toBe(layer.queue.progress);
            expect(layer.loading).toBe(layer.queue.loading);
        });
    });

    describe('constructor', () => {
        it('should assign the provided properties', () => {
            const id = 'foo';
            const extent = new Extent('EPSG:4326', 0, 0, 0, 0);
            const layer = new Layer(id, {
                extent,
                source: new NullSource(),
            });

            expect(layer.id).toEqual(id);
            expect(layer.extent).toEqual(extent);
        });

        it('should not accept all sources', () => {
            expect(() => new Layer('id', { source: {} })).toThrowError(/missing or invalid source/);
            expect(() => new Layer('id', { source: null })).toThrowError(/missing or invalid source/);
        });
    });

    describe('visible', () => {
        it('should return the correct value', () => {
            const layer = new Layer('foo', { source: new NullSource() });

            expect(layer.visible).toEqual(true);

            layer.visible = false;
            expect(layer.visible).toEqual(false);
        });

        it('should raise the visible-property-changed event', () => {
            const layer = new Layer('foo', { source: new NullSource() });

            const listener = jest.fn();
            layer.addEventListener('visible-property-changed', listener);

            expect(listener).not.toHaveBeenCalled();

            layer.visible = false;
            layer.visible = false;
            layer.visible = false;

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });
});
