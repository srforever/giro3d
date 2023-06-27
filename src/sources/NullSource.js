/* eslint-disable class-methods-use-this */
/**
 * @module sources/NullSource
 */

import ImageSource from './ImageSource.js';

/**
 * An image source that produces nothing. Mainly for debugging/testing purposes.
 *
 * @api
 */
class NullSource extends ImageSource {
    constructor(options = {}) {
        super(options);

        this.extent = options.extent;
    }

    getCrs() {
        return this.extent.crs();
    }

    getImages() {
        return [];
    }

    getExtent() {
        return this.extent;
    }
}

export default NullSource;
