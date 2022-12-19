/**
 * @module Core/layer/ColorMapMode
 */
/**
 * Modes of the color map gradient.
 *
 * @api
 * @enum
 */
const ColorMapMode = {
    /**
     * The color map describes an elevation gradient.
     *
     * @api
     * @type {number}
     */
    Elevation: 1,

    /**
     * The color map describes a slope gradient.
     *
     * @api
     * @type {number}
     */
    Slope: 2,

    /**
     * The color map describes an aspect gradient.
     *
     * @api
     * @type {number}
     */
    Aspect: 3,
};

export default ColorMapMode;
