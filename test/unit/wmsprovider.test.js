import assert from 'assert';
import proj4 from 'proj4';

import wms, { chooseExtentToDownload } from '../../src/Provider/WMSProvider.js';
import Extent from '../../src/Core/Geographic/Extent.js';
import { STRATEGY_MIN_NETWORK_TRAFFIC, STRATEGY_PROGRESSIVE, STRATEGY_DICHOTOMY } from '../../src/Core/Layer/LayerUpdateStrategy.js';

function makeLayer(crs = undefined) {
    const layer = {
        name: 'foo',
        projection: crs || 'EPSG:4326',
        extent: new Extent(crs || 'EPSG:4326', 0, 0, 0, 0),
    };
    return layer;
}

describe('WMSProvider', () => {
    describe('verify wms strategies implementation', () => {
        proj4.defs('EPSG:4978', '+proj=geocent +datum=WGS84 +units=m +no_defs');

        const extent = new Extent('EPSG:4978', {
            west: 0,
            east: 0.1,
            south: -0.1,
            north: 0,
        });
        const currentExtent = new Extent('EPSG:4978', {
            west: 0,
            east: 5,
            south: -5,
            north: 0,
        });
        const layer = {
            updateStrategy: {
                type: -1,
            },
            extent: new Extent('EPSG:4978', {
                west: -10,
                east: 10,
                south: -10,
                north: 10,
            }),
        };

        it('STRATEGY_MIN_NETWORK_TRAFFIC should return directly node\'s extent', () => {
            layer.updateStrategy.type = STRATEGY_MIN_NETWORK_TRAFFIC;

            const result = chooseExtentToDownload(layer, extent, currentExtent);

            assert.equal(result.west(), extent.west(), 'Incorrect west value');
            assert.equal(result.east(), extent.east(), 'Incorrect east value');
            assert.equal(result.north(), extent.north(), 'Incorrect north value');
            assert.equal(result.south(), extent.south(), 'Incorrect south value');
        });

        it('STRATEGY_PROGRESSIVE should download the next tile in the quadtree', () => {
            layer.updateStrategy.type = STRATEGY_PROGRESSIVE;

            const result = chooseExtentToDownload(layer, extent, currentExtent);

            assert.equal(result.west(), 0, 'Incorrect west value');
            assert.equal(result.east(), 2.5, 'Incorrect east value');
            assert.equal(result.north(), 0, 'Incorrect north value');
            assert.equal(result.south(), -2.5, 'Incorrect south value');
        });

        it('STRATEGY_DICHOTOMY', () => {
            layer.updateStrategy.type = STRATEGY_DICHOTOMY;

            const result = chooseExtentToDownload(layer, extent, currentExtent);

            assert.equal(result.west(), 0, 'Incorrect west value');
            assert.equal(result.east(), 0.625, 'Incorrect east value');
            assert.equal(result.north(), 0, 'Incorrect north value');
            assert.equal(result.south(), -0.625, 'Incorrect south value');
        });
    });

    describe('preprocessDataLayer', () => {
        it('should throw on missing properties', () => {
            expect(() => wms.preprocessDataLayer({}))
                .toThrowError('layer.name is required');

            expect(() => wms.preprocessDataLayer({ name: 'foo' }))
                .toThrowError('layer.extent is required');

            expect(() => wms.preprocessDataLayer(
                {
                    name: 'foo',
                    extent: new Extent('EPSG:4326', 0, 0, 0, 0),
                },
            )).toThrowError('layer.projection is required');
        });

        it('should assign default values', () => {
            const layer = makeLayer();

            wms.preprocessDataLayer(layer);

            expect(layer.options.zoom).toStrictEqual({ min: 0, max: 21 });
            expect(layer.width).toBe(256);
            expect(layer.version).toBe('1.3.0');
            expect(layer.style).toBe('');
            expect(layer.transparent).toBe(false);
            expect(layer.format).toBe('image/png');
        });

        it('should honor passed properties', () => {
            const layer = makeLayer();
            layer.version = '1.1.0';
            layer.style = 'myStyle';
            layer.transparent = true;
            layer.heightMapWidth = 123;
            layer.axisOrder = 'foobar';
            layer.format = 'image/jpg';

            wms.preprocessDataLayer(layer);

            expect(layer.version).toBe('1.1.0');
            expect(layer.style).toBe('myStyle');
            expect(layer.width).toBe(123);
            expect(layer.axisOrder).toBe('foobar');
            expect(layer.format).toBe('image/jpg');
        });

        it('should honor WMS 1.3.0 axis order on EPSG:4326', () => {
            const layer = makeLayer('EPSG:4326');
            layer.version = '1.3.0';

            wms.preprocessDataLayer(layer);

            expect(layer.axisOrder).toBe('swne');
        });

        it('should honor WMS 1.1.0 axis order on EPSG:4326', () => {
            const layer = makeLayer('EPSG:4326');
            layer.version = '1.1.0';

            wms.preprocessDataLayer(layer);

            expect(layer.axisOrder).toBe('wsen');
        });

        it('should honor WMS axis order on non EPSG:4326', () => {
            const layer = makeLayer('EPSG:foo');
            layer.version = '1.1.0';

            wms.preprocessDataLayer(layer);

            expect(layer.axisOrder).toBe('wsen');
        });

        it('should throw on unsupported layer format', () => {
            const layer = makeLayer();
            layer.format = 'image/foobar';
            expect(() => wms.preprocessDataLayer(layer))
                .toThrowError(/Layer foo: unsupported format/);
        });

        it('should set a correct templated URL', () => {
            const layer = makeLayer();
            layer.version = '1.1.0';
            layer.style = 'myStyle';
            layer.transparent = true;
            layer.heightMapWidth = 123;
            layer.axisOrder = 'foobar';
            layer.format = 'image/jpg';
            layer.url = 'http://example.com/';

            wms.preprocessDataLayer(layer);

            const expected = 'http://example.com/?SERVICE=WMS&REQUEST=GetMap&LAYERS=foo&VERSION=1.1.0&STYLES=myStyle&FORMAT=image/jpg&TRANSPARENT=true&BBOX=%bbox&SRS=EPSG:4326&WIDTH=123&HEIGHT=123';
            expect(layer.url).toBe(expected);
        });
    });
});
