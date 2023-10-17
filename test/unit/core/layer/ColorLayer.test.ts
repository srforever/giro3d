import ColorLayer from 'src/core/layer/ColorLayer';
import NullSource from 'src/sources/NullSource';

describe('ColorLayer', () => {
    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new ColorLayer(undefined, { source: new NullSource() })).toThrow();
        });

        it('should define layer properties', () => {
            const layer = new ColorLayer('id', { source: new NullSource() });

            expect(layer.frozen).toEqual(false);
            expect(layer.visible).toEqual(true);
            expect(layer.opacity).toEqual(1.0);
        });

        it('should disable no-data filling by default', () => {
            const layer = new ColorLayer('id', { source: new NullSource() });

            expect(layer.noDataOptions).toEqual({ replaceNoData: false });
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

    describe('brightness', () => {
        it('should return the correct value', () => {
            const layer = new ColorLayer('foo', { source: new NullSource() });

            expect(layer.brightness).toEqual(0);

            layer.brightness = 0.1;
            expect(layer.brightness).toEqual(0.1);
        });

        it('should raise the brightness-property-changed event', () => {
            const layer = new ColorLayer('foo', { source: new NullSource() });

            const listener = jest.fn();
            layer.addEventListener('brightness-property-changed', listener);

            expect(listener).not.toHaveBeenCalled();

            layer.brightness = 0.5;
            layer.brightness = 0.5;
            layer.brightness = 0.5;

            // The event should be called only when the value actually changes
            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('contrast', () => {
        it('should return the correct value', () => {
            const layer = new ColorLayer('foo', { source: new NullSource() });

            expect(layer.contrast).toEqual(1);

            layer.contrast = 0.1;
            expect(layer.contrast).toEqual(0.1);
        });

        it('should raise the contrast-property-changed event', () => {
            const layer = new ColorLayer('foo', { source: new NullSource() });

            const listener = jest.fn();
            layer.addEventListener('contrast-property-changed', listener);

            expect(listener).not.toHaveBeenCalled();

            layer.contrast = 0.5;
            layer.contrast = 0.5;
            layer.contrast = 0.5;

            // The event should be called only when the value actually changes
            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('saturation', () => {
        it('should return the correct value', () => {
            const layer = new ColorLayer('foo', { source: new NullSource() });

            expect(layer.saturation).toEqual(1);

            layer.saturation = 0.1;
            expect(layer.saturation).toEqual(0.1);
        });

        it('should raise the saturation-property-changed event', () => {
            const layer = new ColorLayer('foo', { source: new NullSource() });

            const listener = jest.fn();
            layer.addEventListener('saturation-property-changed', listener);

            expect(listener).not.toHaveBeenCalled();

            layer.saturation = 0.5;
            layer.saturation = 0.5;
            layer.saturation = 0.5;

            // The event should be called only when the value actually changes
            expect(listener).toHaveBeenCalledTimes(1);
        });
    });
});
