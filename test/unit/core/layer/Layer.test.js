import assert from 'assert';
import TileWMS from 'ol/source/TileWMS.js';
import Vector from 'ol/source/Vector.js';
import VectorTile from 'ol/source/VectorTile.js';
import Stamen from 'ol/source/Stamen.js';

import Layer, { defineLayerProperty } from '../../../../src/core/layer/Layer.js';
import Map from '../../../../src/entities/Map.js';
import Instance from '../../../../src/core/Instance.js';
import {
    STRATEGY_DICHOTOMY, STRATEGY_MIN_NETWORK_TRAFFIC,
} from '../../../../src/core/layer/LayerUpdateStrategy.js';
import Extent from '../../../../src/core/geographic/Extent.js';
import { setupGlobalMocks } from '../../mocks.js';

describe('defineLayerProperty', () => {
    it('should do nothing if the property already exists', () => {
        const layer = new Layer('foo', { standalone: true });

        defineLayerProperty(layer, 'myProp', 'value1', undefined);
        defineLayerProperty(layer, 'myProp', 'value2', undefined);

        assert.deepEqual(layer.myProp, 'value1');
    });

    it('should assign the provided default value', () => {
        const layer = new Layer('foo', { standalone: true });
        const defaultValue = 'defaultValue';

        defineLayerProperty(layer, 'myProp', defaultValue, undefined);

        assert.deepEqual(layer.myProp, defaultValue);
    });

    it('should make the setter call the provided onChange handler', () => {
        const layer = new Layer('foo', { standalone: true });
        const defaultValue = 'defaultValue';
        let onChangeCalled;
        const onChange = function onChange(targetLayer, propName) {
            onChangeCalled = { targetLayer, propName };
        };

        defineLayerProperty(layer, 'myProp', defaultValue, onChange);

        layer.myProp = 'bar';
        assert.strictEqual(onChangeCalled.targetLayer, layer);
        assert.strictEqual(onChangeCalled.propName, 'myProp');
    });

    it('should make the setter call dispatchEvent()', () => {
        const layer = new Layer('foo', { standalone: true });
        const defaultValue = 'defaultValue';
        let eventRaised;
        const eventHandler = function eventHandler(event) {
            eventRaised = event;
        };

        defineLayerProperty(layer, 'myProp', defaultValue, undefined);
        layer.addEventListener('myProp-property-changed', eventHandler);

        layer.myProp = 'bar';
        assert.strictEqual(eventRaised.type, 'myProp-property-changed');
        assert.strictEqual(eventRaised.previous.myProp, defaultValue);
        assert.strictEqual(eventRaised.new.myProp, 'bar');
    });
});

describe('Layer', () => {
    beforeEach(() => {
        setupGlobalMocks();
    });

    describe('constructor', () => {
        it('should assign the provided properties', () => {
            const id = 'foo';
            const extent = new Extent('EPSG:4326', 0, 0, 0, 0);
            const updateStrategy = { type: STRATEGY_DICHOTOMY };
            const projection = 'EPSG:4326';
            const layer = new Layer(
                id,
                {
                    extent, updateStrategy, projection, standalone: true,
                },
            );

            assert.strictEqual(layer.id, id);
            assert.throws(() => { layer.id = 'bar'; }, 'id should be immutable');

            assert.strictEqual(layer.extent, extent);
            assert.strictEqual(layer.updateStrategy, updateStrategy);
            assert.strictEqual(layer.projection, projection);
        });

        it('should assign the not provided properties from map or default', () => {
            const id = 'foo';
            const extent = new Extent('EPSG:4326', 0, 0, 0, 0);
            const updateStrategy = { type: STRATEGY_MIN_NETWORK_TRAFFIC };
            const projection = 'EPSG:4326';

            const map = new Map('foo', {
                extent,
            });

            const viewerDiv = document.createElement('div');
            const mainLoop = {
                gfxEngine: {
                    getWindowSize: jest.fn,
                    renderer: {
                        domElement: viewerDiv,
                    },
                },
                scheduleUpdate: jest.fn,
                scheduler: {
                    getProtocolProvider: jest.fn,
                },
            };
            const options = { mainLoop, crs: projection };
            const instance = new Instance(viewerDiv, options);

            instance.add(map);

            const layer = new Layer(id, { standalone: true });

            assert.strictEqual(layer.extent, undefined);
            assert.deepEqual(layer.updateStrategy, updateStrategy);
            assert.strictEqual(layer.projection, undefined);
            assert.strictEqual(layer.backgroundColor, undefined);

            map.addLayer(layer);

            assert.strictEqual(layer.extent, map.extent);
            assert.deepEqual(layer.extent, extent);
            assert.deepEqual(layer.updateStrategy, updateStrategy);
            assert.strictEqual(layer.projection, map.projection);
            assert.deepEqual(layer.projection, projection);
            assert.strictEqual(layer.backgroundColor, undefined);
        });

        it('should not accept all sources', () => {
            let layer = new Layer('id', { source: new TileWMS({}) });
            assert.strictEqual(layer.protocol, 'oltile');
            assert.strictEqual(layer.standalone, false);

            layer = new Layer('id', { source: new Stamen({ layer: 'watercolor', wrapX: false }) });
            assert.strictEqual(layer.protocol, 'oltile');
            assert.strictEqual(layer.standalone, false);

            layer = new Layer('id', { source: new Vector() });
            assert.strictEqual(layer.protocol, 'olvector');
            assert.strictEqual(layer.standalone, false);

            layer = new Layer('id', { source: new VectorTile({ url: 'https://domain.tld/{z}/{x}/{y}.pbf' }) });
            assert.strictEqual(layer.protocol, 'olvectortile');
            assert.strictEqual(layer.standalone, false);

            layer = new Layer('id', { standalone: true });
            assert.strictEqual(layer.protocol, undefined);
            assert.strictEqual(layer.standalone, true);

            assert.throws(() => new Layer('id', { source: { constructor: Instance } }));
        });
    });

    describe('dispose', () => {
        it('should dispose the color map, if any', () => {
            const colorMap = { dispose: jest.fn() };
            const layer = new Layer('foo', { standalone: true, colorMap });

            expect(colorMap.dispose).not.toHaveBeenCalled();
            layer.dispose();
            expect(colorMap.dispose).toHaveBeenCalled();
        });
    });
});
