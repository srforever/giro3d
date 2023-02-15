import ElevationLayer from '../../../../src/core/layer/ElevationLayer.js';
import Interpretation from '../../../../src/core/layer/Interpretation.js';

describe('ElevationLayer', () => {
    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new ElevationLayer(undefined)).toThrow('id is undefined');
        });

        it('should define layer properties', () => {
            const layer = new ElevationLayer('id', {
                interpretation: Interpretation.Raw,
                standalone: true,
                minmax: { min: 111, max: 333 },
            });

            expect(layer.id).toEqual('id');
            expect(layer.frozen).toStrictEqual(false);
            expect(layer.interpretation).toEqual(Interpretation.Raw);
            expect(layer.type).toEqual('ElevationLayer');
            expect(layer.minmax).toEqual({ min: 111, max: 333 });
        });
    });

    describe('minMaxFromTexture', () => {
        describe('should access the correct data', () => {
            const min = -13;
            const max = 9393;
            const alpha = 1;
            const data = [
                min, 0, 0, alpha,
                1, 0, 0, alpha,
                max, 0, 0, alpha,
                3, 0, 0, alpha,
            ];
            let layer;

            beforeEach(() => {
                layer = new ElevationLayer('foo', { standalone: true });
            });

            it('already contains a min and max property', () => {
                const tex = { min, max };

                const minmax = layer.minMaxFromTexture(tex);

                expect(minmax.min).toEqual(min);
                expect(minmax.max).toEqual(max);
            });

            it('DataTexture', () => {
                const tex1 = { isDataTexture: true, image: { data } };
                const tex2 = { isDataTexture: true, image: { data: { data } } };

                const minmax1 = layer.minMaxFromTexture(tex1);
                const minmax2 = layer.minMaxFromTexture(tex2);

                expect(minmax1.min).toEqual(min);
                expect(minmax1.max).toEqual(max);

                expect(minmax2.min).toEqual(min);
                expect(minmax2.max).toEqual(max);

                expect(tex1.min).toEqual(min);
                expect(tex2.min).toEqual(min);
                expect(tex1.max).toEqual(max);
                expect(tex2.max).toEqual(max);
            });

            it('RenderTargetTexture', () => {
                const tex = { isRenderTargetTexture: true, data };

                const minmax1 = layer.minMaxFromTexture(tex);

                expect(minmax1.min).toEqual(min);
                expect(minmax1.max).toEqual(max);

                expect(tex.min).toEqual(min);
                expect(tex.max).toEqual(max);
            });
        });
    });
});
