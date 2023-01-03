/**
 * @module Core/layer/Interpretation
 */

import { NearestFilter, Texture } from 'three';

/**
 * Describes how an image pixel should be interpreted.
 *
 * Note: this is unrelated to the file format / encoding (like JPG and PNG). This interpretation
 * occurs after the image was decoded into a pixel buffer.
 *
 * @enum
 * @api
 */
const Mode = {
    Raw: 0,
    MapboxTerrainRGB: 1,
    ScaleToMinMax: 2,
};

/**
 * Describes how an image pixel should be interpreted. Any interpretation other than `Raw` will
 * apply a specific processing to every pixel of an image.
 *
 * Note: this is unrelated to the file format / encoding (like JPG and PNG). This interpretation
 * occurs after the image was decoded into a pixel buffer.
 *
 * @example
 * // Use the Mapbox Terrain RGB interpretation
 * const interp = Interpretation.MapboxTerrainRGB;
 *
 * // Use the raw interpretation
 * const raw = Interpretation.Raw;
 *
 * // Use the min/max scaling interpretation
 * const min = 234.22;
 * const max = 994.1;
 * const minmax = Interpretation.ScaleToMinMax(min, max);
 * @api
 */
class Interpretation {
    /**
     * Internal use only. Use the static constructors instead.
     *
     * @param {Mode} mode The mode.
     * @param {object} [opts=undefined] The options.
     */
    constructor(mode, opts = undefined) {
        this._mode = mode;
        this._opts = opts;
    }

    /**
     * Gets the interpretation mode.
     *
     * @api
     * @type {Mode}
     * @readonly
     */
    get mode() {
        return this._mode;
    }

    /**
     * The pixel is used as is, without transformation.
     * Compatible with both grayscale and color images. This is the default.
     *
     * @api
     * @static
     * @type {Interpretation}
     */
    static get Raw() {
        return new Interpretation(Mode.Raw);
    }

    /**
     * The image represent an elevation encoded with the [Mapbox Terrain RGB scheme](https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/).
     * The input is an sRGB image, and the output will be a grayscale image.
     *
     * @api
     * @static
     * @type {Interpretation}
     */
    static get MapboxTerrainRGB() {
        return new Interpretation(Mode.MapboxTerrainRGB);
    }

    /**
     * Applies a scaling processing to pixels with the provided min/max values. Input can be either
     * color or grayscale, and output will be either color or grayscale, depending on input.
     *
     * Note: this is typically used to encode elevation data into a 8-bit grayscale image.
     *
     * @example
     * // We have a grayscale image that represents elevation data ranging from 130 to 1500 meters.
     * // Pixels with color 0 will map to 130 meters, and the pixels with color
     * // 255 will map to 1500 meters, and so on.
     * const interp = Interpretation.ScaleToMinMax(130, 1500);
     * @api
     * @static
     * @param {number} min The minimum value of the dataset, that maps to 0.
     * @param {number} max The maximum value of the dataset, that maps to 255.
     * @returns {Interpretation} The scaling values.
     */
    static ScaleToMinMax(min, max) {
        if (typeof min === 'number' && typeof max === 'number') {
            return new Interpretation(Mode.ScaleToMinMax, { min, max });
        }

        throw new Error('min and max should be numbers');
    }

    /**
     * Returns a user-friendly string representation of this interpretation.
     *
     * @api
     * @returns {string} The string representation.
     */
    toString() {
        switch (this.mode) {
            case Mode.Raw: return 'Raw';
            case Mode.MapboxTerrainRGB: return 'Mapbox Terrain RGB';
            case Mode.ScaleToMinMax:
                return `Scaled (min: ${this._opts.min}, max: ${this._opts.max})`;
            default:
                return 'unknown';
        }
    }

    /**
     * Updates the provided texture if necessary to make it compatible with this interpretation.
     *
     * @param {Texture} texture The texture to update.
     */
    prepareTexture(texture) {
        if (this.mode === Mode.MapboxTerrainRGB) {
            // Mapbox interpretation is extremely sensitive to color values,
            // which is why we cannot use any filter to alter the colors.
            texture.minFilter = NearestFilter;
            texture.magFilter = NearestFilter;
        }
    }

    /**
     * @param {object} uniform The uniform to set.
     */
    setUniform(uniform) {
        const mode = this.mode;

        uniform.mode = mode;

        switch (mode) {
            case Mode.ScaleToMinMax:
                uniform.min = this._opts.min;
                uniform.max = this._opts.max;
                break;
            case Mode.Raw:
            case Mode.MapboxTerrainRGB:
                break;
            default:
                throw new Error(`unknown interpretation mode: ${this.mode}`);
        }
    }
}

export {
    Mode,
};

export default Interpretation;
