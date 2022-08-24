/**
 * @module sources/CogSource
 */

/**
 * Class used as a source to create a {@linkcode module:Core/layer/Layer~Layer layer}
 * when the data is a Cloud Optimized GeoTIFF.
 *
 * @api
 */
class CogSource {
    /**
     * Creates a COG source.
     *
     * @param {object} [options={}] options
     * @param {string} options.url the url of the cog image
     */
    constructor(options = {}) {
        this.url = options.url;
    }
}

export default CogSource;
