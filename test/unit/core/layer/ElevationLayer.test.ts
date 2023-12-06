import ElevationLayer from 'src/core/layer/ElevationLayer';
import Interpretation from 'src/core/layer/Interpretation';
import NullSource from 'src/sources/NullSource';

describe('ElevationLayer', () => {
    describe('constructor', () => {
        it('should auto-generate an id if no id is specified', () => {
            const layer = new ElevationLayer({ source: new NullSource() });

            expect(layer.id).toBeDefined();
        });

        it('should define layer properties', () => {
            const layer = new ElevationLayer({
                interpretation: Interpretation.Raw,
                source: new NullSource(),
                minmax: { min: 111, max: 333 },
                name: 'foo',
            });

            expect(layer.name).toEqual('foo');
            expect(layer.frozen).toStrictEqual(false);
            expect(layer.interpretation).toEqual(Interpretation.Raw);
            expect(layer.type).toEqual('ElevationLayer');
            expect(layer.minmax).toEqual({ min: 111, max: 333 });
        });
    });
});
