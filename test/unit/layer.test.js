import assert from 'assert';
import Layer, { ImageryLayers, defineLayerProperty } from '../../src/Core/Layer/Layer.js';

/**
 * Create a pseudolayer for testing purposes
 *
 * @param {string} id the id of the layer
 * @param {number} seq the sequence number of the layer
 * @returns {object} the created layer
 */
function L(id, seq) {
    return { id, sequence: seq };
}

describe('ImageryLayers', () => {
    describe('getColorLayersIdOrderedBySequence()', () => {
        it('should return the correct ordered array()', () => {
            const layers = [L('B', 7), L('A', 1), L('C', 8), L('D', 9)];

            const sorted = ImageryLayers.getColorLayersIdOrderedBySequence(layers);

            assert.deepEqual(sorted, ['A', 'B', 'C', 'D']);
        });
    });

    describe('moveLayerUp()', () => {
        it('should increment the layer sequence', () => {
            const layers = [L('A', 0), L('B', 1), L('C', 2), L('D', 3), L('E', 4)];

            ImageryLayers.moveLayerUp(layers[1], layers);

            const expected = [L('A', 0), L('B', 2), L('C', 1), L('D', 3), L('E', 4)];

            assert.deepEqual(layers, expected);
        });

        it('should do nothing if layer is already the top one', () => {
            const layers = [L('A', 0), L('B', 1), L('C', 2), L('D', 3), L('E', 4)];

            ImageryLayers.moveLayerUp(layers[layers.length - 1], layers);

            const expected = [L('A', 0), L('B', 1), L('C', 2), L('D', 3), L('E', 4)];

            assert.deepEqual(layers, expected);
        });
    });

    describe('moveLayerDown()', () => {
        it('should decrement the layer sequence', () => {
            const layers = [L('A', 0), L('B', 1), L('C', 2), L('D', 3), L('E', 4)];

            ImageryLayers.moveLayerDown(layers[1], layers);

            const expected = [L('A', 1), L('B', 0), L('C', 2), L('D', 3), L('E', 4)];

            assert.deepEqual(layers, expected);
        });

        it('should do nothing if layer is already the bottom one', () => {
            const layers = [L('A', 0), L('B', 1), L('C', 2), L('D', 3), L('E', 4)];

            ImageryLayers.moveLayerDown(layers[0], layers);

            const expected = [L('A', 0), L('B', 1), L('C', 2), L('D', 3), L('E', 4)];

            assert.deepEqual(layers, expected);
        });
    });
});

describe('Layer', () => {
    describe('constructor', () => {
        it('should assign the id property', () => {
            const id = 'foo';
            const layer = new Layer(id);

            assert.strictEqual(layer.id, id);
        });

        it('should make the id property immutable', () => {
            const id = 'foo';
            const layer = new Layer(id);

            assert.throws(() => { layer.id = 'bar'; });
        });
    });

    describe('addEventListener', () => {
        it('should make dispatchEvent() use specified handler', () => {
            // arrange
            const layer = new Layer('foo');
            let x = 0;
            const handler = function handler(event) { x = event.value; };
            const type = 'visible-property-changed';

            // act
            layer.addEventListener(type, handler);
            layer.dispatchEvent({ type, value: 999 });

            // assert
            assert.deepEqual(x, 999);
        });
    });

    describe('removeEventListener()', () => {
        it('should make dispatchEvent() not use specified handler', () => {
            // arrange
            const layer = new Layer('foo');
            let x = 0;
            const handler = function handler(event) { x = event.value; };
            const type = 'visible-property-changed';
            layer.addEventListener(type, handler);

            // act
            layer.removeEventListener(type, handler);
            layer.dispatchEvent({ type, value: 999 });

            // assert
            assert.deepEqual(x, 0);
        });
    });
});

describe('defineLayerProperty', () => {
    it('should do nothing if the property already exists', () => {
        const layer = new Layer('foo');

        defineLayerProperty(layer, 'myProp', 'value1', undefined);
        defineLayerProperty(layer, 'myProp', 'value2', undefined);

        assert.deepEqual(layer.myProp, 'value1');
    });

    it('should assign the provided default value', () => {
        const layer = new Layer('foo');
        const defaultValue = 'defaultValue';

        defineLayerProperty(layer, 'myProp', defaultValue, undefined);

        assert.deepEqual(layer.myProp, defaultValue);
    });

    it('should make the setter call the provided onChange handler', () => {
        const layer = new Layer('foo');
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
        const layer = new Layer('foo');
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
