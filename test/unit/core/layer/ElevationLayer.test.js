import ElevationLayer from '../../../../src/Core/layer/ElevationLayer.js';
import { ELEVATION_FORMAT } from '../../../../src/utils/DEMUtils.js';

describe('ElevationLayer', () => {
    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new ElevationLayer(undefined)).toThrow();
        });

        it('should define layer properties', () => {
            const layer = new ElevationLayer('id', { elevationFormat: ELEVATION_FORMAT.MAPBOX_RGB, standalone: true });

            expect(layer.id).toEqual('id');
            expect(layer.frozen).toStrictEqual(false);
            expect(layer.elevationFormat).toStrictEqual(ELEVATION_FORMAT.MAPBOX_RGB);
            expect(layer.type).toEqual('ElevationLayer');
        });

        it('should set the heightFieldOffset and heightFieldScale with default values if applicable', () => {
            const layer = new ElevationLayer('id', {
                elevationFormat: ELEVATION_FORMAT.HEIGHFIELD,
                standalone: true,
            });

            expect(layer.heightFieldOffset).toEqual(0);
            expect(layer.heightFieldScale).toEqual(255);
        });

        it('should set the heightFieldOffset and heightFieldScale with passed options if applicable', () => {
            const layer = new ElevationLayer('id', {
                elevationFormat: ELEVATION_FORMAT.HEIGHFIELD,
                heightFieldOffset: 21,
                heightFieldScale: 1111,
                standalone: true,
            });

            expect(layer.heightFieldOffset).toEqual(21);
            expect(layer.heightFieldScale).toEqual(1111);
        });
    });
});
