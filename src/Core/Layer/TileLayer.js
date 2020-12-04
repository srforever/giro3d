import Layer from './Layer.js';

export default class TileLayer extends Layer {
    constructor(options = {}) {
        super(options.id);
        this.type = options.type;
        this.protocol = options.protocol;
        this.source = options.source;
    }
}
