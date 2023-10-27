import VectorSource from 'ol/source/Vector';
import Extent from '../../../src/core/geographic/Extent';
import FeatureCollection from '../../../src/entities/FeatureCollection';

describe('FeatureCollection', () => {
    describe('constructor', () => {
        const source = new VectorSource();
        const extent = new Extent('EPSG:4326', {
            west: 0, east: 10, south: 0, north: 10,
        });

        it('should throw on undefined id', () => {
            expect(() => new FeatureCollection(undefined, { source, extent })).toThrow(/Missing id parameter/);
        });

        it('should throw if the extent is not provided', () => {
            expect(() => new FeatureCollection('foo', { source, extent: null }))
                .toThrow(/Error while initializing FeatureCollection with id "foo": missing options.extent/);
        });

        it('should throw if the extent is invalid', () => {
            // reversed extent (min values are greater than max values)
            const invalid = new Extent('EPSG:3857', +10, -10, +5, -5);

            expect(() => new FeatureCollection('foo', { source, extent: invalid })).toThrow(/Invalid extent/);
        });

        it('should throw if the source is not present', () => {
            // ignoring next line because it's a runtime check
            // @ts-ignore
            expect(() => new FeatureCollection('foo', { extent })).toThrow('options.source is mandatory.');
            expect(() => new FeatureCollection('foo', { extent, source: null })).toThrow('options.source is mandatory.');
        });

        it('should assign the correct options', () => {
            const fc = new FeatureCollection(
                'foo',
                {
                    source,
                    extent,
                    minLevel: 10,
                    maxLevel: 15,
                    elevation: 50,
                },
            );
            expect(fc.minLevel).toEqual(10);
            expect(fc.maxLevel).toEqual(15);
            expect(fc.extent).toEqual(extent);
        });
    });
});
