import { NearestFilter, Texture } from 'three';
import Interpretation, { Mode } from 'src/core/layer/Interpretation';

describe('Interpretation', () => {
    describe('constructor', () => {
        it('should assign the properties', () => {
            const interp = new Interpretation(Mode.CompressTo8Bit, {
                min: 33,
                max: 1202,
                negateValues: true,
            });

            expect(interp.min).toEqual(33);
            expect(interp.max).toEqual(1202);
            expect(interp.negateValues).toEqual(true);
        });
    });

    describe('presets', () => {
        it('should return correct values', () => {
            const raw = Interpretation.Raw;
            const mapbox = Interpretation.MapboxTerrainRGB;
            const scale = Interpretation.ScaleToMinMax(1, 100);
            const compress = Interpretation.CompressTo8Bit(5, 899);

            expect(raw.mode).toEqual(Mode.Raw);
            expect(mapbox.mode).toEqual(Mode.MapboxTerrainRGB);
            expect(compress.mode).toEqual(Mode.CompressTo8Bit);
            expect(scale.mode).toEqual(Mode.ScaleToMinMax);
            expect(scale.options).toEqual({ min: 1, max: 100 });
            expect(compress.options).toEqual({ min: 5, max: 899 });
        });
    });

    describe('withNegatedValues', () => {
        it('should return the same instance', () => {
            const original = Interpretation.Raw;
            const negated = original.withNegatedValues();

            expect(original).toBe(negated);
        });

        it('should set the negateValues property', () => {
            const interp = Interpretation.Raw.withNegatedValues();
            expect(interp.negateValues).toBe(true);
        });
    });

    describe('setUniform', () => {
        it('should set the correct values', () => {
            const raw = Interpretation.Raw.setUniform({});
            expect(raw.mode).toEqual(0);
            expect(raw.negateValues).toBeUndefined();
            expect(raw.min).toBeUndefined();
            expect(raw.max).toBeUndefined();

            const compress = Interpretation.CompressTo8Bit(23, 111).setUniform({});
            expect(compress.mode).toEqual(3);
            expect(compress.negateValues).toBeUndefined();
            expect(compress.min).toEqual(23);
            expect(compress.max).toEqual(111);

            const scale = Interpretation.ScaleToMinMax(23, 111).setUniform({});
            expect(scale.mode).toEqual(2);
            expect(scale.negateValues).toBeUndefined();
            expect(scale.min).toEqual(23);
            expect(scale.max).toEqual(111);

            const mapbox = Interpretation.MapboxTerrainRGB.setUniform({});
            expect(mapbox.mode).toEqual(1);
            expect(mapbox.negateValues).toBeUndefined();
            expect(mapbox.min).toBeUndefined();
            expect(mapbox.max).toBeUndefined();

            const custom = new Interpretation(Mode.ScaleToMinMax, {
                min: -45,
                max: 111,
                negateValues: true,
            }).setUniform({});

            expect(custom.mode).toEqual(Mode.ScaleToMinMax);
            expect(custom.negateValues).toEqual(true);
            expect(custom.min).toEqual(-45);
            expect(custom.max).toEqual(111);
        });
    });

    describe('prepareTexture', () => {
        it('should set nearest filter for mapbox terrain RGB', () => {
            const raw = Interpretation.Raw;
            const mapbox = Interpretation.MapboxTerrainRGB;
            const scale = Interpretation.ScaleToMinMax(1, 100);

            const texture1 = new Texture();
            const texture2 = new Texture();
            texture2.minFilter = undefined;
            texture2.magFilter = undefined;

            mapbox.prepareTexture(texture1);
            raw.prepareTexture(texture2);
            scale.prepareTexture(texture2);

            expect(texture1.minFilter).toBe(NearestFilter);
            expect(texture1.magFilter).toBe(NearestFilter);

            expect(texture2.minFilter).toBeUndefined();
            expect(texture2.magFilter).toBeUndefined();
        });
    });
});
