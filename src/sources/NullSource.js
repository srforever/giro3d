/* eslint-disable class-methods-use-this */
/**
 * @module sources/NullSource
 */

import Extent from '../core/geographic/Extent.js';
import ImageSource from './ImageSource.js';

/**
 * An image source that produces nothing. Mainly for debugging/testing purposes.
 *
 * @api
 */
class NullSource extends ImageSource {
    constructor(options = {}) {
        super(options);

        this.extent = options?.extent ?? new Extent('EPSG:3857', 0, 10, 0, 10);
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
