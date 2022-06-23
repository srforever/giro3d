import assert from 'assert';
import TileLayer from '../../src/Core/Layer/TileLayer.js';

describe('TileLayer', () => {
    describe('constructor', () => {
        it('should assign the provided properties', () => {
            const id = 'foo';
            const type = 'color';
            const protocol = 'wms';
            const source = 'mySource';

            const layer = new TileLayer({
                id, type, protocol, source,
            });

            assert.throws(() => { layer.id = 'bar'; }, 'id should be immutable');
            assert.strictEqual(layer.type, type);
            assert.strictEqual(layer.protocol, protocol);
            assert.strictEqual(layer.source, source);
        });
    });
});
