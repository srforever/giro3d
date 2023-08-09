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

uniform sampler2D colorMapAtlas; // The color maps atlas

const int COLORMAP_MODE_DISABLED = 0;
const int COLORMAP_MODE_ELEVATION = 1;
const int COLORMAP_MODE_SLOPE = 2;
const int COLORMAP_MODE_ASPECT = 3;

float map(float value, float min1, float max1, float min2, float max2) {
    return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

vec4 computeColorMap(
    vec2 tileDimensions,
    LayerInfo layer,
    sampler2D sampledTexture,
    ColorMap colorMap,
    sampler2D lut,
    vec2 rawUv
) {
    float value;

    vec2 uv = computeUv(rawUv, layer.offsetScale.xy, layer.offsetScale.zw);

    if (colorMap.mode == COLORMAP_MODE_ELEVATION) {
        value = getElevation(sampledTexture, uv);
    } else {
        vec2 derivatives = computeDerivatives(tileDimensions, uv, sampledTexture, layer.textureSize, layer.offsetScale);
        if (colorMap.mode == COLORMAP_MODE_SLOPE) {
            value = calcSlope(derivatives);
        } else if (colorMap.mode == COLORMAP_MODE_ASPECT) {
            value = calcAspect(derivatives);
        }
        value *= 180.0 / M_PI; // Convert radians to degrees
    }

    value = clamp(value, colorMap.min, colorMap.max);
    float t = map(value, colorMap.min, colorMap.max, 0., 1.);
    vec3 rgb = texture2D(lut, vec2(t, colorMap.offset)).rgb;
    float a = texture2D(sampledTexture, uv).a;
    return vec4(rgb, a);
}
