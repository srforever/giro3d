import Extent from 'src/core/geographic/Extent';
import LayerComposer from 'src/core/layer/LayerComposer';

describe('LayerComposer', () => {
    describe('getMinMax', () => {
        it('should ignore images that do not have a valid min/max', () => {
            // @ts-expect-error incomplete definition
            const composer = new LayerComposer({ renderer: null });

            const extent = new Extent('EPSG:3857', 0, 10, 0, 10);

            // @ts-expect-error incomplete definition
            composer.images.set('img0', { extent, min: undefined, max: NaN });
            // @ts-expect-error incomplete definition
            composer.images.set('img1', { extent, min: +Infinity, max: 5 });
            // @ts-expect-error incomplete definition
            composer.images.set('img2', { extent, min: 1, max: -Infinity });
            // @ts-expect-error incomplete definition
            composer.images.set('img3', { extent, min: 5, max: 9 });
            // @ts-expect-error incomplete definition
            composer.images.set('img4', { extent, min: 2, max: 3 });

            const { min, max } = composer.getMinMax(extent);

            expect(min).toEqual(2);
            expect(max).toEqual(9);
        });
    });
});
