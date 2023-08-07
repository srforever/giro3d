const int INTERPRETATION_RAW = 0;
const int INTERPRETATION_MAPBOX_TERRAIN_RGB = 1;
const int INTERPRETATION_SCALED = 2;
const int INTERPRETATION_COMPRESS_TO_8BIT = 3;

struct Interpretation {
    int mode;
    float min; // only for INTERPRETATION_SCALED
    float max; // only for INTERPRETATION_SCALED
};

/**
 * Decodes the raw color according to the specified interpretation.
 */
vec4 decode(vec4 raw, Interpretation interpretation) {
    if(interpretation.mode == INTERPRETATION_RAW) {
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
            raw.a);
    }
    if (interpretation.mode == INTERPRETATION_COMPRESS_TO_8BIT) {
        float min = interpretation.min;
        float max = interpretation.max;
        float scale = 1.0 / (max - min);
        return vec4(
            (raw.r - min) * scale,
            (raw.g - min) * scale,
            (raw.b - min) * scale,
            raw.a);
    }

    // This should not happen, but there is no way to "fail" a shader.
    return raw;
}
