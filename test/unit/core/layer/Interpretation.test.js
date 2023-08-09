import { NearestFilter } from 'three';
import Interpretation, { Mode } from '../../../../src/core/layer/Interpretation.js';

describe('Interpretation', () => {
    describe('static constructors', () => {
        it('should return correct values', () => {
            const raw = Interpretation.Raw;
            const mapbox = Interpretation.MapboxTerrainRGB;
            const scale = Interpretation.ScaleToMinMax(1, 100);
            const compress = Interpretation.CompressTo8Bit(5, 899);

            expect(raw.mode).toEqual(Mode.Raw);
            expect(mapbox.mode).toEqual(Mode.MapboxTerrainRGB);
            expect(compress.mode).toEqual(Mode.CompressTo8Bit);
            expect(scale.mode).toEqual(Mode.ScaleToMinMax);
            expect(scale._opts).toEqual({ min: 1, max: 100 });
            expect(compress._opts).toEqual({ min: 5, max: 899 });
        });
    });

    describe('prepareTexture', () => {
        it('should set nearest filter for mapbox terrain RGB', () => {
            const raw = Interpretation.Raw;
            const mapbox = Interpretation.MapboxTerrainRGB;
            const scale = Interpretation.ScaleToMinMax(1, 100);

            const texture1 = {};
            const texture2 = {};

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
