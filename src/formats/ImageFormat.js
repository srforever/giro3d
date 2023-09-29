/**
 * @module formats/ImageFormat
 */
import { Texture } from 'three';

/**
 * Base class for image decoders. To implement your own image decoder, subclass this class.
 *
 */
class ImageFormat {
    constructor(flipY) {
        this.isImageFormat = true;
        this.type = 'ImageFormat';

        this.flipY = flipY;
    }

    /**
     * Decodes the blob into a texture.
     *
     * @param {Blob} blob The blob to decode.
     * @param {object} options The decoder options.
     * @returns {Promise<Texture>} The decoded texture.
     * @abstract
     */
    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    decode(blob, options) {
        throw new Error('abstract method');
    }
}

export default ImageFormat;
