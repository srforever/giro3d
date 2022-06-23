/**
 * @module Core/Layer/TileLayer
 */
import { Layer } from './Layer.js';

/**
 * A Layer made of tiles
 *
 * @api
 */
export default class TileLayer extends Layer {
    /**
     * Builds a tile layer from the specified options
     *
     * @api
     * @param {object} options the layer options
     * @param {string} options.id the layer unique identifier
     * @param {string} options.protocol the layer protocol
     * @param {object} options.source the layer source
     */
    constructor(options = {}) {
        super(options.id);
        this.type = options.type;
        this.protocol = options.protocol;
        this.source = options.source;
    }
}
