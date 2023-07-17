import ColorLayer from '../../../../src/core/layer/ColorLayer.js';
import NullSource from '../../../../src/sources/NullSource.js';

describe('ColorLayer', () => {
    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new ColorLayer(undefined)).toThrow();
        });

        it('should define layer properties', () => {
            const layer = new ColorLayer('id', { source: new NullSource() });

            expect(layer.frozen).toEqual(false);
            expect(layer.visible).toEqual(true);
            expect(layer.opacity).toEqual(1.0);
        });
    });

    describe('opacity', () => {
        it('should return the correct value', () => {
            const layer = new ColorLayer('foo', { source: new NullSource() });

            expect(layer.opacity).toEqual(1);

            layer.opacity = 0.1;
            expect(layer.opacity).toEqual(0.1);
        });

        it('should raise the opacity-property-changed event', () => {
            const layer = new ColorLayer('foo', { source: new NullSource() });

            const listener = jest.fn();
            layer.addEventListener('opacity-property-changed', listener);

            expect(listener).not.toHaveBeenCalled();

            layer.opacity = 0.5;
            layer.opacity = 0.5;
            layer.opacity = 0.5;

            // The event should be called only when the value actually changes
            expect(listener).toHaveBeenCalledTimes(1);
        });
    });
});
