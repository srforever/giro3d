/**
 * Describes a color map.
 * Color maps are a way to change the color of a texture by
 * mapping the pixel's grayscale color into a value of the lookup table (LUT).
 * The pixel color acts like a UV value, that is then scaled with the min/max values
 * and mapped to the LUT texture.
 * Note: due to limitations in GLSL, the actual LUT texture must be in a separate uniform.
 */
struct ColorMap {
    int         mode;
    float       min;
    float       max;
    float       offset; // The V offset in the color map atlas texture.
};

const int COLORMAP_MODE_DISABLED = 0;
const int COLORMAP_MODE_ELEVATION = 1;
const int COLORMAP_MODE_SLOPE = 2;
const int COLORMAP_MODE_ASPECT = 3;
