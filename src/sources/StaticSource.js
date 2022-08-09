import Fetcher from '../Provider/Fetcher.js';

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
        this.url = new URL(options.url, window.location);
        this.networkOptions = options.networkOptions;
    }

    buildUrl(image) {
        return this.url.href.substr(0, this.url.href.lastIndexOf('/') + 1) + image;
    }

    fetchMetadata() {
        return Fetcher.json(this.url.href, this.networkOptions);
    }
}

export default StaticSource;
