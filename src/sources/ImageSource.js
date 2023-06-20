/**
 * @module sources/ImageSource
 */

import {
    EventDispatcher,
    Texture,
    UnsignedByteType,
    FloatType,
} from 'three';
import Extent from '../core/geographic/Extent.js';

class ImageResult {
    /**
     * @param {object} options options
     * @param {string} options.id The unique identifier of this result.
     * @param {Texture} options.texture The texture.
     * @param {Texture} options.extent The extent.
     * @param {number} options.min The minimum value of this image (if applicable).
     * @param {number} options.max The maximum value of this image (if applicable).
     */
    constructor(options) {
        this.id = options.id;
        this.texture = options.texture;
        this.extent = options.extent;
        this.min = options.min;
        this.max = options.max;
    }
}

/**
 * Base class for all image sources. The `ImageSource` produces images to be consumed by clients,
 * such as map layers.
 *
 * @api
 * @abstract
 */
class ImageSource extends EventDispatcher {
    /**
     * @api
     * @param {object} options Options.
     * @param {boolean} [options.flipY = false] Should images be flipped vertically during
     * composition ?
     * @param {boolean} [options.is8bit = true] The data type of images generated.
     * For regular color images, this should be `true`. For images with a high dynamic range,
     * or images that requires additional processing, this should be `false`.
     */
    constructor(options = {}) {
        super();
        /**
         * Gets whether images generated from this source should be flipped vertically.
         *
         * @type {boolean}
         */
        this.flipY = options.flipY ?? false;

        /**
         * Gets the datatype of images generated by this source.
         */
        this.datatype = options.is8bit ? UnsignedByteType : FloatType;

        this.version = 0;
    }

    /**
     * Returns an adjusted extent, width and height so that request pixels are aligned with source
     * pixels, and requests do not oversample the source.
     *
     * @api
     * @param {Extent} requestExtent The request extent.
     * @param {number} requestWidth The width, in pixels, of the request extent.
     * @param {number} requestHeight The height, in pixels, of the request extent.
     * @param {number} margin The margin, in pixels, around the initial extent.
     * @returns {{extent: Extent, width: number, height: number}|null} The adjusted parameters.
     */
    // eslint-disable-next-line no-unused-vars, class-methods-use-this
    adjustExtentAndPixelSize(requestExtent, requestWidth, requestHeight, margin = 0) {
        // Default implementation.
        return null;
    }

    // eslint-disable-next-line jsdoc/require-returns-check
    /**
     * Returns the extent of this source.
     *
     * @api
     * @returns {Extent} The extent of the source.
     */
    // eslint-disable-next-line class-methods-use-this
    getExtent() {
        throw new Error('not implemented: getExtent()');
    }

    /**
     * Raises an event to reload the source.
     *
     * @api
     */
    update() {
        this.dispatchEvent({ type: 'updated' });
    }

    /**
     * Gets whether this source contains the specified extent.
     *
     * @api
     * @param {Extent} extent The extent to test.
     */
    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    contains(extent) {
        throw new Error('not implemented: contains()');
    }

    /**
     * Initializes the source.
     *
     * @api
     * @param {object} options Options.
     * @param {string} options.targetProjection The target projection. Only useful for sources
     * that are able to reproject their data on the fly (typically vector sources).
     * @returns {Promise} A promise that resolves when the source is initialized.
     */
    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    initialize(options) {
        return Promise.resolve();
    }

    // eslint-disable-next-line jsdoc/require-returns-check
    /**
     * Gets the images for the specified extent and pixel size.
     *
     * @api
     * @param {object} options The options.
     * @param {Extent} options.extent The extent of the request area.
     * @param {number} options.width The pixel width of the request area.
     * @param {string} options.id The identifier of the node that emitted the request.
     * @param {number} options.height The pixel height of the request area.
     * @param {AbortSignal} [options.signal] The optional abort signal.
     * @returns {Array<{ id: string, request: function(()):Promise<ImageResult>}>} An array
     * containing the functions to generate the images asynchronously.
     */
    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    getImages(options) {
        throw new Error('not implemented: getImages()');
    }

    /**
     * Disposes unmanaged resources of this source.
     *
     * @api
     */
    // eslint-disable-next-line class-methods-use-this
    dispose() {
        // Implement this in derived classes to cleanup unmanaged resources,
        // such as cached objects.
    }
}

export default ImageSource;

export { ImageResult };
