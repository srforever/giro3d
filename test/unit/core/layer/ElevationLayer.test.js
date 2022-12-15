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

        it('should set the elevationFormat with default value if not provided', () => {
            const layer = new ElevationLayer('id', { standalone: true });

            expect(layer.elevationFormat).toEqual(4);
        });
    });

    describe('minMaxFromBuffer', () => {
        it('should only use the first channel of each pixel', () => {
            const buf = [1, 999, 999, 999, 2, 999, 999, 999];
            const minmax = ElevationLayer.minMaxFromBuffer(buf);
            expect(minmax.min).toEqual(1);
            expect(minmax.max).toEqual(2);
        });

        it('should ignore NaN', () => {
            const buf = [1, 0, 0, 1, 3, 0, 0, 1, NaN, 0, 0, 1];
            const minmax = ElevationLayer.minMaxFromBuffer(buf);
            expect(minmax.min).toEqual(1);
            expect(minmax.max).toEqual(3);
        });

        it('should ignore no-data', () => {
            const nodata = 32032.2323;
            const buf = [1, 0, 0, 1, 3, 0, 0, 1, nodata, 0, 0, 1];
            const minmax = ElevationLayer.minMaxFromBuffer(buf, nodata);
            expect(minmax.min).toEqual(1);
            expect(minmax.max).toEqual(3);
        });
    });
});
