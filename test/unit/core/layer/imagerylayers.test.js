import assert from 'assert';
import { ImageryLayers } from '../../../../src/core/layer/Layer.js';

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
