/**
 * @module sources/PotreeSource
 */

/**
 * The data source for a [Potree](https://github.com/potree/potree) point cloud.
 *
 * @api
 */
class PotreeSource {
    /**
     * Creates an instance of PotreeSource.
     *
     * @api
     * @param {string} url The URL to the dataset.
     * @param {string} [filename='cloud.js'] The filename of the dataset.
     * @param {object} [networkOptions={}] The network options.
     */
    constructor(url, filename = 'cloud.js', networkOptions = {}) {
        if (!url) {
            throw new Error('missing url parameter');
        }

        this.isPotreeSource = true;
        this.type = 'PotreeSource';

        this.url = url;
        this.filename = filename;
        this.networkOptions = networkOptions || {};
    }
}

export default PotreeSource;
