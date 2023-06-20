import { EventDispatcher } from 'three';
import assert from 'assert';
import EventUtils from '../../../src/utils/EventUtils.js';

class Mock extends EventDispatcher {

}

describe('definePropertyWithChangeEvent', () => {
    it('should do nothing if the property already exists', () => {
        const layer = new Mock();

        EventUtils.definePropertyWithChangeEvent(layer, 'myProp', 'value1', undefined);
        EventUtils.definePropertyWithChangeEvent(layer, 'myProp', 'value2', undefined);

        assert.deepEqual(layer.myProp, 'value1');
    });

    it('should assign the provided default value', () => {
        const layer = new Mock();
        const defaultValue = 'defaultValue';

        EventUtils.definePropertyWithChangeEvent(layer, 'myProp', defaultValue, undefined);

        assert.deepEqual(layer.myProp, defaultValue);
    });

    it('should make the setter call the provided onChange handler', () => {
        const layer = new Mock();
        const defaultValue = 'defaultValue';
        let onChangeCalled;
        const onChange = function onChange(targetLayer, propName) {
            onChangeCalled = { targetLayer, propName };
        };

        EventUtils.definePropertyWithChangeEvent(layer, 'myProp', defaultValue, onChange);

        layer.myProp = 'bar';
        assert.strictEqual(onChangeCalled.targetLayer, layer);
        assert.strictEqual(onChangeCalled.propName, 'myProp');
    });

    it('should make the setter call dispatchEvent()', () => {
        const layer = new Mock();
        const defaultValue = 'defaultValue';
        let eventRaised;
        const eventHandler = function eventHandler(event) {
            eventRaised = event;
        };

        EventUtils.definePropertyWithChangeEvent(layer, 'myProp', defaultValue, undefined);
        layer.addEventListener('myProp-property-changed', eventHandler);

        layer.myProp = 'bar';
        assert.strictEqual(eventRaised.type, 'myProp-property-changed');
        assert.strictEqual(eventRaised.previous.myProp, defaultValue);
        assert.strictEqual(eventRaised.new.myProp, 'bar');
    });
});
