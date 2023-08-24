/**
 * @module core/layer/Interpretation
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
    CompressTo8Bit: 3,
};

/**
 * The interpretation options.
 *
 * @api
 * @typedef {object} InterpretationOptions
 * @property {Mode} mode The interpretation mode.
 * @property {boolean} [negateValues] Whether the sign of elevation values should be flipped.
 * @property {number} [min] The min value of the interpretation range (only for applicable modes).
 * @property {number} [max] The max value of the interpretation range (only for applicable modes).
 */

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
 *
 * // Negates the sign of all pixel values, without any interpretation.
 * const custom = new Interpretation(Mode.Raw, {
 *     negateValues: true,
 * })
 * @api
 */
class Interpretation {
    /**
     * Creates a new interpretation.
     *
     * @param {Mode} mode The mode.
     * @param {InterpretationOptions} [opts] The options.
     */
    constructor(mode, opts = {}) {
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
     * The min value (only for `MinMax` mode).
     *
     * @type {number}
     * @readonly
     */
    get min() {
        return this._opts.min;
    }

    /**
     * The max value (only for `MinMax` mode).
     *
     * @type {number}
     * @readonly
     */
    get max() {
        return this._opts.max;
    }

    /**
     * Gets or set the sign negation of elevation values.
     *
     * @type {boolean}
     * @readonly
     */
    get negateValues() {
        return this._opts.negateValues;
    }

    set negateValues(v) {
        this._opts.negateValues = v;
    }

    isDefault() {
        return this.mode === Mode.Raw && !this.negateValues;
    }

    /**
     * Reverses the sign of elevation values, such that positive values are going downward, rather
     * than updwards. In other words, interpret values as depths rather than heights.
     *
     * @api
     * @returns {this} This object.
     */
    withNegatedValues() {
        this.negateValues = true;
        return this;
    }

    /**
     * Preset for raw. The pixel is used as is, without transformation.
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
     * Preset for Mapbox Terrain RGB. The image represent an elevation encoded with the [Mapbox Terrain RGB scheme](https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/).
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
     * Preset for scaling interpretation.
     *
     * Applies a scaling processing to pixels with the provided min/max values with the following
     * formula : `output = min + input * (max - min)`.
     *
     * Input can be either color or grayscale, and output will be either color or grayscale,
     * depending on input.
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
     * Preset for compression.
     *
     * Compresses the input range into the 8-bit range. This is the inverse of
     * {@link Interpretation.ScaleToMinMax}.
     *
     * Note: this is typically used to visualize high dynamic range images, such as 32-bit data,
     * into the 8-bit range suitable for display.
     *
     * @example
     * // We have a 16-bit satellite image with min = 200, and max = 4000. We wish to visualize it
     * // without saturation.
     * const interp = Interpretation.CompressTo8Bit(200, 4000);
     * @api
     * @static
     * @param {number} min The minimum value of the dataset.
     * @param {number} max The maximum value of the dataset.
     * @returns {Interpretation} The scaling values.
     */
    static CompressTo8Bit(min, max) {
        if (typeof min === 'number' && typeof max === 'number') {
            return new Interpretation(Mode.CompressTo8Bit, { min, max });
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
            case Mode.CompressTo8Bit:
                return `Compressed to 8-bit (min: ${this._opts.min}, max: ${this._opts.max})`;
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
     * @returns {object} The updated uniform.
     */
    setUniform(uniform) {
        const mode = this.mode;

        uniform.mode = mode;
        uniform.negateValues = this.negateValues;

        switch (mode) {
            case Mode.ScaleToMinMax:
            case Mode.CompressTo8Bit:
                uniform.min = this._opts.min;
                uniform.max = this._opts.max;
                break;
            case Mode.Raw:
            case Mode.MapboxTerrainRGB:
                break;
            default:
                throw new Error(`unknown interpretation mode: ${this.mode}`);
        }

        return uniform;
    }
}

export {
    Mode,
};

export default Interpretation;
