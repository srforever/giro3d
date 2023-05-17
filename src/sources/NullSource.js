/* eslint-disable class-methods-use-this */
/**
 * @module sources/NullSource
 */

import ImageSource from './ImageSource.js';

/**
 * An image source that produces nothing. Mainly for debugging/testing purposes.
 */
class NullSource extends ImageSource {
    constructor(options = {}) {
        super();

        this.extent = options.extent;
    }

    getImages() {
        return [];
    }

    contains() {
        return false;
    }

    getExtent() {
        return this.extent;
    }
}

export default NullSource;
