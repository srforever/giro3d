/**
 * @module core/layer/ColorMapMode
 */
/**
 * Modes of the color map gradient.
 *
 * @enum
 */
const ColorMapMode = {
    /**
     * The color map describes an elevation gradient.
     *
     * @type {number}
     */
    Elevation: 1,

    /**
     * The color map describes a slope gradient.
     *
     * @type {number}
     */
    Slope: 2,

    /**
     * The color map describes an aspect gradient.
     *
     * @type {number}
     */
    Aspect: 3,
};

export default ColorMapMode;
