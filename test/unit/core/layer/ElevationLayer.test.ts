import ElevationLayer from 'src/core/layer/ElevationLayer';
import Interpretation from 'src/core/layer/Interpretation.js';
import NullSource from 'src/sources/NullSource.js';

describe('ElevationLayer', () => {
    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new ElevationLayer(undefined, { source: new NullSource() })).toThrow('id is undefined');
        });

        it('should define layer properties', () => {
            const layer = new ElevationLayer('id', {
                interpretation: Interpretation.Raw,
                source: new NullSource(),
                minmax: { min: 111, max: 333 },
            });

            expect(layer.id).toEqual('id');
            expect(layer.frozen).toStrictEqual(false);
            expect(layer.interpretation).toEqual(Interpretation.Raw);
            expect(layer.type).toEqual('ElevationLayer');
            expect(layer.minmax).toEqual({ min: 111, max: 333 });
        });
    });
});
