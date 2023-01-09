/**
 * @module core/layer/ColorMap
 */
import {
    Color,
    Texture,
} from 'three';
import TextureGenerator from '../../utils/TextureGenerator.js';
import ColorMapMode from './ColorMapMode.js';

/**
 * Represents a 1D color gradient bounded by a `min` and `max` values.
 *
 * Whenever a color map is associated with a grayscale texture, the color intensity of the texture
 * is used a a parameter to sample the color gradient.
 *
 * The `mode` describes how the intensity is interpreted.
 *
 * Note: since this color map owns a texture, it is disposable. Don't forget to call `dispose()` to
 * free texture memory.
 *
 * @example
 * // Create a color map for elevations between 0 and 2500 meters, mapping 0 meter to red,
 * // and 2500 meters to green. All intermediate elevations will interpolate between those colors.
 * const colors = [new Color('red'), new Color('green')];
 * const colorMap = new ColorMap(colors, 0, 2500, ColorMapMode.Elevation);
 *
 * const texture = colorMap.getTexture();
 *
 * // Disable the color map.
 * colorMap.active = false;
 *
 * // When finished with this color map, dispose it.
 * colorMap.dispose();
 * @api
 */
class ColorMap {
    /**
     * Creates an instance of ColorMap.
     *
     * @api
     * @param {Color[]} colors The colors of this color map.
     * @param {number} min The lower bound of the color map range.
     * @param {number} max The upper bound of the color map range.
     * @param {ColorMapMode} [mode=ColorMapMode.Elevation] The mode of the color map.
     */
    constructor(colors, min, max, mode = ColorMapMode.Elevation) {
        if (colors === undefined) {
            throw new Error('colors is undefined');
        }
        this._min = min;
        this._max = max;
        this._mode = mode;
        this._colors = colors;
        this._cachedTexture = null;
        this._active = true;
    }

    /**
     * Gets or sets the color map mode.
     *
     * @api
     * @type {ColorMapMode}
     * @example
     * // Start with an elevation gradient, ranging from 100 to 1500 meters.
     * const colorMap = new ColorMap(colors, 100, 1500, ColorMapMode.Elevation);
     *
     * // Change mode to slope, and set min and max to 0-90 degrees.
     * colorMap.mode = ColorMapMode.Slope;
     * colorMap.min = 0;
     * colorMap.max = 90;
     */
    get mode() {
        return this._mode;
    }

    set mode(v) {
        if (this._mode !== v) {
            this._mode = v;
        }
    }

    /**
     * Enables or disables the color map.
     *
     * @api
     * @type {boolean}
     */
    get active() {
        return this._active;
    }

    set active(v) {
        this._active = v;
    }

    /**
     * Gets or sets the lower bound of the color map range.
     *
     * @api
     * @type {number}
     */
    get min() {
        return this._min;
    }

    set min(v) {
        if (this._min !== v) {
            this._min = v;
        }
    }

    /**
     * Gets or sets the upper bound of the color map range.
     *
     * @api
     * @type {number}
     */
    get max() {
        return this._max;
    }

    set max(v) {
        if (this._max !== v) {
            this._max = v;
        }
    }

    /**
     * Gets or sets the colors of the color map.
     *
     * @api
     * @type {Color[]}
     */
    get colors() {
        return this._colors;
    }

    set colors(v) {
        if (this._colors !== v) {
            this._colors = v;
            this._cachedTexture?.dispose();
            this._cachedTexture = null;
        }
    }

    /**
     * Returns a 1D texture containing the colors of this color map.
     *
     * @api
     * @returns {Texture} The resulting texture.
     */
    getTexture() {
        if (this._cachedTexture === null) {
            this._cachedTexture = TextureGenerator.create1DTexture(this._colors);
        }

        return this._cachedTexture;
    }

    /**
     * Disposes the texture owned by this color map.
     *
     * @api
     */
    dispose() {
        this._cachedTexture?.dispose();
    }
}

export {
    ColorMapMode,
};

export default ColorMap;
