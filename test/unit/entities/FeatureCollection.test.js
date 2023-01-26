import Extent from '../../../src/core/geographic/Extent.js';
import FeatureCollection from '../../../src/entities/FeatureCollection.js';

describe('FeatureCollection', () => {
    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new FeatureCollection(undefined)).toThrow(/Missing id parameter/);
        });

        it('should throw if the extent is not provided', () => {
            expect(() => new FeatureCollection('foo', { extent: null }))
                .toThrow(/Error while initializing FeatureCollection with id "foo": missing options.extent/);
        });

        it('should throw if the extent is invalid', () => {
            // reversed extent (min values are greater than max values)
            const invalid = new Extent('EPSG:3857', +10, -10, +5, -5);

            expect(() => new FeatureCollection('foo', { extent: invalid })).toThrow(/Invalid extent/);
        });

        it('should assign the correct options', () => {
            const extent = new Extent('EPSG:4326', {
                west: 0, east: 10, south: 0, north: 10,
            });
            const fc = new FeatureCollection(
                'foo',
                {
                    extent,
                    minLevel: 10,
                    maxLevel: 15,
                    altitude: 50,
                },
            );
            expect(fc.minLevel).toEqual(10);
            expect(fc.maxLevel).toEqual(15);
            expect(fc.extent).toEqual(extent);
        });
    });
});
