const int INTERPRETATION_RAW = 0;
const int INTERPRETATION_MAPBOX_TERRAIN_RGB = 1;
const int INTERPRETATION_SCALED = 2;

struct Interpretation {
    int mode;
    float min; // only for INTERPRETATION_SCALED
    float max; // only for INTERPRETATION_SCALED
};

/**
 * Decodes the texture using the provided interpretation.
 */
vec4 decode(sampler2D texture, vec2 coord, Interpretation interpretation) {
    vec4 raw = texture2D(texture, coord);

    if (interpretation.mode == INTERPRETATION_RAW) {
        return raw;
    }
    if (interpretation.mode == INTERPRETATION_MAPBOX_TERRAIN_RGB) {
        vec4 color = raw * (255.0 * 0.1);
        float value = -10000.0 + color.r * 256.0 * 256.0 + color.g * 256.0 + color.b;
        return vec4(value, value, value, 1.);
    }
    if (interpretation.mode == INTERPRETATION_SCALED) {
        float min = interpretation.min;
        float max = interpretation.max;
        float scale = max - min;
        return vec4(
            min + raw.r * scale,
            min + raw.g * scale,
            min + raw.b * scale,
            1.);
    }

    // This should not happen, but there is no way to "fail" a shader.
    return raw;
}
