/**
 * Class used as a source to create a {@linkcode module:Core/layer/Layer~Layer layer}
 * when the data is a custom tileset.
 *
 * @api
 */
class StaticSource {
    /**
     * Creates a Static source.
     *
     * @param {object} [options={}] options
     * @param {string} options.url the url of the tileset metadata
     * @param {object} options.networkOptions Network options
     */
    constructor(options = {}) {
        this.url = options.url;
        this.networkOptions = options.networkOptions;
    }
}

export default StaticSource;
