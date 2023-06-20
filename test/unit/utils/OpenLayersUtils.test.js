import Extent from '../../../src/core/geographic/Extent.js';
import OpenLayersUtils from '../../../src/utils/OpenLayersUtils.js';

describe('OpenLayersUtils', () => {
    describe('toOLExtent/fromOLExtent', () => {
        it('should round trip', () => {
            const extent = new Extent('EPSG:3857', 1203, 405405, -20323, 202020);
            const ol = OpenLayersUtils.toOLExtent(extent);
            const extent2 = OpenLayersUtils.fromOLExtent(ol, extent.crs());

            expect(extent.crs()).toEqual(extent2.crs());
            expect(extent._values).toEqual(extent2._values);
        });
    });
});
