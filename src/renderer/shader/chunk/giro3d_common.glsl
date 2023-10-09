#define M_PI    3.1415926535897932384626433832795

/**
 * Describe a color layer's attributes.
 */
struct LayerInfo {
    vec4        offsetScale; // The offset/scale tuple.
    vec4        color;       // Includes opacity/visible as alpha component
    vec2        textureSize; // The size, in pixels, of the atlas section mapping to this layer.
    int         mode;        // The layer mode (normal, mask)
    #if defined(ENABLE_ELEVATION_RANGE)
    vec2        elevationRange; // Optional elevation range for the layer. Any fragment above or below this range will be ignored.
    #endif
    vec3        brightnessContrastSaturation;
};


float getElevation(sampler2D tex, vec2 uv) {
    vec4 c = texture2D(tex, uv);
    return c.r;
}

vec4 blend(vec4 fore, vec4 back) {
    if (fore.a == 0. && back.a == 0.) {
        return vec4(0);
    }
    float alpha = fore.a + back.a * (1.0 - fore.a);
    vec3 color = (fore.rgb * fore.a) + back.rgb * (back.a * (1.0 - fore.a)) / alpha;

    return vec4(color, alpha);
}

vec3 desaturate(vec3 color, float factor) {
    vec3 lum = vec3(0.299, 0.587, 0.114);
    vec3 gray = vec3(dot(lum, color));
    return mix(color, gray, factor);
}

// This version of atan is numerically stable around zero
// See https://stackoverflow.com/a/27228836
// This is used to circumvent a bug on Mac devices where this computation would produce visual artifacts.
float atan2(in float y, in float x) {
    return x == 0.0 ? sign(y) * M_PI / 2. : atan(y, x);
}

vec2 computeDerivatives(vec2 dimensions, vec2 uv, sampler2D tex, vec2 textureSize, vec4 offsetScale) {
    // Compute pixel dimensions, in normalized coordinates.
    // Since textures are not necessarily square, we must compute both width and height separately.
    float texWidth = textureSize.x;
    float texHeight = textureSize.y;

    float width = 1.0 / texWidth;
    float height = 1.0 / texHeight;

    // Now compute the elevations for the 8 neigbouring pixels
    // +---+---+---+
    // | a | b | c |
    // +---+---+---+
    // | d | e | f |
    // +---+---+---+
    // | g | h | i |
    // +---+---+---+
    // Note: 'e' is the center of the sample. We don't use it for derivative computation.
    float a = getElevation(tex, uv + vec2(-width, height));
    float b = getElevation(tex, uv + vec2( 0.0, height));
    float c = getElevation(tex, uv + vec2( width, height));
    float d = getElevation(tex, uv + vec2(-width, 0.0));
    float f = getElevation(tex, uv + vec2( width, 0.0));
    float g = getElevation(tex, uv + vec2(-width, -height));
    float h = getElevation(tex, uv + vec2( 0.0, -height));
    float i = getElevation(tex, uv + vec2( width, -height));

    float cellWidth = dimensions.x / (offsetScale.z * textureSize.x);
    float cellHeight = dimensions.y / (offsetScale.w * textureSize.y);
    float dzdx = ((c + 2.0 * f + i) - (a + 2.0 * d + g)) / (8.0 * cellWidth);
    float dzdy = ((g + 2.0 * h + i) - (a + 2.0 * b + c)) / (8.0 * cellHeight);

    return vec2(dzdx, dzdy);
}

/**
 * Returns the slope given the derivatives (X and Y derivatives)
 */
float calcSlope( vec2 derivatives ) {
    // https://desktop.arcgis.com/en/arcmap/10.3/tools/spatial-analyst-toolbox/how-slope-works.htm
    return atan(sqrt(derivatives.x * derivatives.x + derivatives.y * derivatives.y)); // In radians
}

/**
 * Returns the aspect (azimuth from the light source)
 */
float calcAspect ( vec2 derivatives ) {
    // https://desktop.arcgis.com/en/arcmap/10.3/tools/spatial-analyst-toolbox/how-aspect-works.htm
    float aspect = atan2(derivatives.y, -derivatives.x);
    if(aspect < 0.0){
        aspect = M_PI * 0.5 - aspect;
    } else if (aspect > M_PI * 0.5) {
        aspect = 2.0 * M_PI - aspect + M_PI * 0.5;
    } else {
        aspect = M_PI * 0.5 - aspect;
    }
    return aspect; // In radians
}

/**
 * Linear map between [min1, max1] and [min2, max2]
 */
float map(float value, float min1, float max1, float min2, float max2) {
    return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

float calcHillshade(vec2 tileDimensions, vec2 textureSize, float zenith, float azimuth, float intensity, vec4 offsetScale, sampler2D tex, vec2 uv){
    // https://desktop.arcgis.com/en/arcmap/10.3/tools/spatial-analyst-toolbox/how-hillshade-works.htm
    vec2 derivatives = computeDerivatives(tileDimensions, uv, tex, textureSize, offsetScale);
    float slope = calcSlope(derivatives);
    float aspect = calcAspect(derivatives);
    float zenith_rad = zenith * M_PI / 180.0; // in radians
    float azimuth_rad = azimuth * M_PI / 180.0; // in radians
    float hillshade = ((cos(zenith_rad) * cos(slope)) + (sin(zenith_rad) * sin(slope) * cos(azimuth_rad - aspect)));
    hillshade = clamp(hillshade, 0., 1.);

    return mix(1., hillshade, intensity);
}

vec2 clamp01(vec2 uv) {
    return vec2(
        clamp(uv.x, 0., 1.),
        clamp(uv.y, 0., 1.));
}

vec2 computeUv(vec2 uv, vec2 offset, vec2 scale) {
    return vec2(
        uv.x * scale.x + offset.x,
        uv.y * scale.y + offset.y);
}

float squaredDistance(vec2 a, vec2 b) {
    vec2 c = a - b;
    return dot(c, c);
}

/**
 * Returns the value of the valid pixel closest to uv.
 */
vec3 getNearestPixel(sampler2D tex, vec2 uv) {
    const int SAMPLES = 64;
    const float fSAMPLES = float(SAMPLES);

    vec3 result = vec3(0, 0, 0);
    float nearest = 9999.;

    // This brute force approach produces very good visual results, but is quite costly.
    // Collect all the samples, then use only the closest valid sample to the requested position.
    for(int x = 0; x < SAMPLES; ++x) {
        for(int y = 0; y < SAMPLES; ++y) {
            float u = float(x) / fSAMPLES;
            float v = float(y) / fSAMPLES;

            vec2 samplePosition = vec2(u, v);

            vec4 color = texture2D(tex, samplePosition);

            // Is it a valid sample ?
            if(color.a == 1.) {
                // We don't need the absolute distance, since we are only interested
                // in the closest point: we avoid a costly square root computation.
                float dist = squaredDistance(samplePosition, uv);

                if (dist < nearest) {
                    nearest = dist;
                    result = color.rgb;
                }
            }
        }
    }

    return result;
}

/*
 * Sample the texture, filling no-data (transparent) pixels with neighbouring
 * valid pixels.
 * Note: a pixel is considered no-data if its alpha channel is less than 1.
 * This way, if a bilinear interpolation touches a no-data pixel, it's also considered no-data.
 */
vec4 texture2DFillNodata(sampler2D tex, vec2 uv) {
    vec4 value = texture2D(tex, uv);
    if(value.a == 1.) {
        return value;
    }

    vec3 nearest = getNearestPixel(tex, uv);

    // Even though the color has been replaced by a neighbouring
    // pixel, the alpha channel must remain transparent !
    // This is is necessary to be able to hide those pixels in the fragment shaders.
    return vec4(nearest.rgb, 0.);
}

const int INTERPRETATION_RAW = 0;
const int INTERPRETATION_MAPBOX_TERRAIN_RGB = 1;
const int INTERPRETATION_SCALED = 2;
const int INTERPRETATION_COMPRESS_TO_8BIT = 3;

struct Interpretation {
    int mode;
    bool negateValues;
    float min; // only for INTERPRETATION_SCALED
    float max; // only for INTERPRETATION_SCALED
};

/**
 * Decodes the raw color according to the specified interpretation.
 */
vec4 decodeInterpretation(vec4 raw, Interpretation interpretation) {
    vec4 result = raw;
    if (interpretation.mode == INTERPRETATION_MAPBOX_TERRAIN_RGB) {
        vec4 color = raw * (255.0 * 0.1);
        float value = -10000.0 + color.r * 256.0 * 256.0 + color.g * 256.0 + color.b;
        result = vec4(value, value, value, 1.);
    } else if (interpretation.mode == INTERPRETATION_SCALED) {
        float min = interpretation.min;
        float max = interpretation.max;
        float scale = max - min;
        result = vec4(
            min + raw.r * scale,
            min + raw.g * scale,
            min + raw.b * scale,
            raw.a);
    } else if (interpretation.mode == INTERPRETATION_COMPRESS_TO_8BIT) {
        float min = interpretation.min;
        float max = interpretation.max;
        float scale = 1.0 / (max - min);
        result = vec4(
            (raw.r - min) * scale,
            (raw.g - min) * scale,
            (raw.b - min) * scale,
            raw.a);
    }

    if (interpretation.negateValues) {
        // Note that we don't flip the alpha channel
        return vec4(-result.r, -result.g, -result.b, result.a);
    }

    return result;
}

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

vec3 adjustBrightnessContrastSaturation(
    vec3 rgb,
    vec3 brightnessContrastSaturation
) {
    rgb = (rgb - 0.5) * brightnessContrastSaturation.y + 0.5;
    rgb += brightnessContrastSaturation.x;

    float luminance = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luminance), rgb, brightnessContrastSaturation.z);
}
