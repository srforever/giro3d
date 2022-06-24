import Extent from '../../src/Core/Geographic/Extent.js';
import wfs from '../../src/Provider/WFSProvider.js';

describe('WFSProvider', () => {
    describe('preprocessDataLayer', () => {
        it('should throw if layer.typename is not defined', () => {
            expect(() => wfs.preprocessDataLayer({})).toThrowError();
        });

        it('should assign default values for undefined properties', () => {
            const typeName = 'foo';
            const extent = {
                south: 0,
                north: 1.5,
                east: 2.5,
                west: 1.11,
            };
            const layer = { typeName, extent };

            wfs.preprocessDataLayer(layer);

            expect(layer.typeName).toBe(typeName);
            expect(layer.crs).toBe('EPSG:4326');
            expect(layer.extent).toBeInstanceOf(Extent);
            expect(layer.extent.north()).toBe(extent.north);
            expect(layer.extent.south()).toBe(extent.south);
            expect(layer.extent.east()).toBe(extent.east);
            expect(layer.extent.west()).toBe(extent.west);
            expect(layer.wireframe).toBe(false);
            expect(layer.version).toBe('2.0.2');
            expect(layer.opacity).toBe(1.0);
        });

        it('should honor property values', () => {
            const typeName = 'foo';
            const crs = 'EPSG:4326';
            const version = '1.0.0';
            const opacity = 0.5;
            const extent = new Extent(
                crs,
                {
                    south: 0,
                    north: 1.5,
                    east: 2.5,
                    west: 1.11,
                },
            );

            const wireframe = true;
            const layer = {
                crs, typeName, extent, wireframe, version, opacity,
            };

            wfs.preprocessDataLayer(layer);

            expect(layer.typeName).toBe(typeName);
            expect(layer.crs).toBe(crs);
            expect(layer.extent).toBe(extent);
            expect(layer.wireframe).toBe(wireframe);
            expect(layer.version).toBe(version);
            expect(layer.opacity).toBe(opacity);
        });

        it('should set a correct templated URL', () => {
            const typeName = 'foo';
            const crs = 'EPSG:4326';
            const version = '1.0.0';
            const opacity = 0.5;
            const url = 'http://example.com/';
            const extent = new Extent(
                crs,
                {
                    south: 0,
                    north: 1.5,
                    east: 2.5,
                    west: 1.11,
                },
            );

            const wireframe = true;
            const layer = {
                crs, typeName, extent, wireframe, version, opacity, url,
            };

            wfs.preprocessDataLayer(layer);

            expect(layer.url).toBe('http://example.com/SERVICE=WFS&REQUEST=GetFeature&typeName=foo&VERSION=1.0.0&SRSNAME=EPSG:4326&outputFormat=application/json&BBOX=%bbox,EPSG:4326');
        });
    });

    describe('tileInsideLimit', () => {
        it('should returnfalse if levels do not match', () => {
            const tile = { level: 3 };
            const layer = { level: 4 };
            const result = wfs.tileInsideLimit(tile, layer);

            expect(result).toBe(false);
        });

        it('should return false if levels match but extents do not intersect', () => {
            const tileExtent = new Extent('EPSG:4326', {
                south: -20,
                north: -10,
                east: -10,
                west: -20,
            });

            const layerExtent = new Extent('EPSG:4326', {
                south: 0,
                north: 10,
                west: 10,
                east: 20,
            });

            const tile = { level: 4, extent: tileExtent };
            const layer = { level: 4, extent: layerExtent };

            expect(wfs.tileInsideLimit(tile, layer)).toBe(false);
        });

        it('should return true if levels match and extents intersect', () => {
            const extent = new Extent('EPSG:4326', {
                south: -20,
                north: -10,
                east: -10,
                west: -20,
            });

            const tile = { level: 4, extent };
            const layer = { level: 4, extent };

            expect(wfs.tileInsideLimit(tile, layer)).toBe(true);
        });
    });
});
