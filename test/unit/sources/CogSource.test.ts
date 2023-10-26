import type { GeoTIFFImage } from 'geotiff';
import Extent from 'src/core/geographic/Extent';
import CogSource from 'src/sources/CogSource';

describe('CogSource', () => {
    describe('constructor', () => {
        it('should assign properties', () => {
            const containsFn = jest.fn();
            const source = new CogSource({ url: 'http://example.com', crs: 'EPSG:1234', containsFn });
            expect(source.url).toEqual('http://example.com');
            expect(source.crs).toEqual('EPSG:1234');
            expect(source.containsFn).toBe(containsFn);
        });
    });

    describe('initialize', () => {
        it('should always return the same promise to avoid concurrent initializations', () => {
            const source = new CogSource({ url: 'http://example.com', crs: 'EPSG:1234' });
            const promise1 = source.initialize();
            const promise2 = source.initialize();

            expect(promise1).toBe(promise2);
        });
    });

    describe('computeExtent', () => {
        it('should rethrow unknown exceptions', () => {
            function getBoundingBox(): number[] {
                throw new Error('unknown');
            }

            const image = {
                getBoundingBox,
            };
            expect(() => CogSource.computeExtent('EPSG:3857', image as GeoTIFFImage)).toThrow(/unknown/);
        });

        it('should return the computed extent from the image bounding box if found', () => {
            const minx = 1;
            const miny = 2;
            const maxx = 3;
            const maxy = 4;

            const image = {
                getBoundingBox: () => [minx, miny, maxx, maxy],
            };

            const extent = CogSource.computeExtent('EPSG:3857', image as GeoTIFFImage);

            expect(extent).toEqual(new Extent('EPSG:3857', minx, maxx, miny, maxy));
        });
    });

    describe('dispose', () => {
        it('should clear the underlying cache', () => {
            const source = new CogSource({ crs: 'EPSG:3857', url: 'http://example.com' });
            source.cache.clear = jest.fn();

            expect(source.cache.clear).not.toHaveBeenCalled();

            source.dispose();

            expect(source.cache.clear).toHaveBeenCalled();
        });
    });
});
