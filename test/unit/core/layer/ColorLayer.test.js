import ColorLayer from '../../../../src/core/layer/ColorLayer.js';
import NullSource from '../../../../src/sources/NullSource.js';

const assert = require('assert');

describe('ColorLayer', () => {
    describe('constructor', () => {
        it('should throw on undefined id', () => {
            assert.throws(() => new ColorLayer(undefined));
        });

        it('should define layer properties', () => {
            const layer = new ColorLayer('id', { source: new NullSource() });

            expect(layer.frozen).toEqual(false);
            expect(layer.visible).toEqual(true);
            expect(layer.opacity).toEqual(1.0);
        });
    });
});
