import type { Texture } from 'three';

export type DecodeOptions = {
    /** The texture width. */
    width?: number;
    /** The texture height */
    height?: number;
    /** The no-data value */
    noDataValue?: number;
};

/**
 * Base class for image decoders. To implement your own image decoder, subclass this class.
 *
 */
abstract class ImageFormat {
    readonly isImageFormat: boolean = true;
    type: string;
    readonly flipY: boolean;

    constructor(flipY: boolean) {
        this.isImageFormat = true;
        this.type = 'ImageFormat';

        this.flipY = flipY;
    }

    /**
     * Decodes the blob into a texture.
     *
     * @param blob The blob to decode.
     * @param options The decoder options.
     * @returns {Promise<Texture>} The decoded texture.
     */
    abstract decode(blob: Blob, options: DecodeOptions): Promise<Texture>;
}

export default ImageFormat;
