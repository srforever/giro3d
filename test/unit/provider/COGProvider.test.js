import Extent from '../../../src/core/geographic/Extent.js';
import COGProvider from '../../../src/provider/COGProvider.js';

describe('COGProvider', () => {
    describe('computePreciseExtent', () => {
        it('should rethrow unknown exceptions', () => {
            const image = {
                getBoundingBox: () => { throw new Error('unknown'); },
            };
            const layer = {};
            expect(() => COGProvider.computePreciseExtent(layer, image)).toThrow(/unknown/);
        });

        it('should assign the preciseExtent property with the layer extent if the bounding box couldn\'t be computed', () => {
            const image = {
                getBoundingBox: () => { throw new Error('The image does not have an affine transformation.'); },
            };
            const layer = {
                extent: 'whatever',
            };

            COGProvider.computePreciseExtent(layer, image);

            expect(layer.preciseExtent).toEqual('whatever');
        });

        it('should assign the preciseExtent property with the GeoTIFF bbox if found', () => {
            const minx = 1;
            const miny = 2;
            const maxx = 3;
            const maxy = 4;

            const image = {
                getBoundingBox: () => [minx, miny, maxx, maxy],
            };
            const layer = {
                extent: new Extent('EPSG:3857', 0, 0, 0, 0),
            };

            COGProvider.computePreciseExtent(layer, image);

            expect(layer.preciseExtent).toEqual(new Extent('EPSG:3857', minx, maxx, miny, maxy));
        });
    });
});
