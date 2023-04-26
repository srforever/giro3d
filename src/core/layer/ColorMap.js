/**
 * @module core/layer/ColorMap
 */
import {
    ClampToEdgeWrapping,
    Color,
    NearestFilter,
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
 * **Important**: since this color map owns a texture, it is disposable. Don't forget to call
 * `dispose()` to free texture memory, when you're finished using the colormap.
 *
 * The `mode` property describes how the intensity of the pixel is interpreted:
 *
 * `Elevation` simply takes the intensity value of the pixel, `Slope` gets the slope of the
 * pixel (assuming it is an elevation texture), and `Aspect` gets the aspect (orientation from
 * the north) of the pixel (assuming it is an elevation texture).
 *
 * The `min` and `max` properties describe how the colormap is applied relative to the intensity of
 * the sampled pixel.
 *
 * Pixel intensities outside of those bounds will take the color of the bound that is the closest
 * (i.e if the intensity is greater than `max`, the color will be the rightmost color of the color
 * ramp).
 *
 * The `colors` property takes an array of colors. To create this array, you can use libraries such
 * as [`colormap`](https://www.npmjs.com/package/colormap) or [`chroma-js`](https://www.npmjs.com/package/chroma-js)
 * to generate the color ramp.
 *
 * To obtain a "discrete" color map, you should use a small number of colors in the ramp.
 * Conversely, to obtain a "linear", continuous color map, you should use a high number of colors,
 * typically 256 values.
 *
 * @example
 * // Create a color map for elevations between 0 and 2500 meters.
 * const colors = makeColorRamp(); // Use whatever library to generate the ramp.
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
            this._cachedTexture.minFilter = NearestFilter;
            this._cachedTexture.magFilter = NearestFilter;
            this._cachedTexture.wrapS = ClampToEdgeWrapping;
            this._cachedTexture.wrapT = ClampToEdgeWrapping;
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
