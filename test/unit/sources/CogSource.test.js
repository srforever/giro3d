import Extent from '../../../src/core/geographic/Extent';
import CogSource from '../../../src/sources/CogSource.js';

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

    describe('computeExtent', () => {
        it('should rethrow unknown exceptions', () => {
            const image = {
                getBoundingBox: () => { throw new Error('unknown'); },
            };
            expect(() => CogSource.computeExtent('EPSG:3857', image)).toThrow(/unknown/);
        });

        it('should return the computed extent from the image bounding box if found', () => {
            const minx = 1;
            const miny = 2;
            const maxx = 3;
            const maxy = 4;

            const image = {
                getBoundingBox: () => [minx, miny, maxx, maxy],
            };

            const extent = CogSource.computeExtent('EPSG:3857', image);

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
