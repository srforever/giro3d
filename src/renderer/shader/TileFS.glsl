#include <PrecisionQualifier>
#include <packing>
#include <ComputeUV>
#include <GetElevation>
#include <LayerInfo>
#include <ColorMap>

#define M_PI    3.1415926535897932384626433832795

/**
 * Map tile fragment shader.
 */

/**
 * Rendering states are modes that change the kind of data that the fragment shader outputs.
 * - FINAL : the FS outputs the regular object's color and aspect. This is the default.
 * - DEPTH : the FS outputs the fragment depth.
 * - ID    : the FS outputs the mesh's ID encoded in a color.
 * - UV    : the FS outputs the fragment's UV.
 * - Z     : the FS outputs the fragment's Z value (sampled from the elevation texture)
 */
const int STATE_FINAL = 0;
const int STATE_DEPTH = 1;
const int STATE_ID = 2;
const int STATE_UV = 3;
const int STATE_Z = 4;

#if defined(ENABLE_LAYER_MASKS)
const int LAYER_MODE_NORMAL = 0;
const int LAYER_MODE_MASK = 1;
const int LAYER_MODE_MASK_INVERTED = 2;
#endif

varying vec2        vUv; // The input UV

uniform int         renderingState; // Current rendering state (default is STATE_FINAL)
uniform int         uuid;           // The ID of the tile mesh (used for the STATE_ID rendering state)

uniform sampler2D   luts; // The color maps atlas

#if COLOR_LAYERS
uniform sampler2D   colorTexture;         // Atlas texture shared among color layers
uniform LayerInfo   layers[COLOR_LAYERS]; // The color layers' infos
uniform ColorMap    layersColorMaps[COLOR_LAYERS]; // The color layers' color maps
#endif

uniform float       opacity;        // The entire map opacity
uniform vec4        backgroundColor; // The background color

#if defined(ENABLE_OUTLINES)
const float         OUTLINE_THICKNESS = 0.003;
#endif

#if defined(ENABLE_ELEVATION_RANGE)
uniform vec2        elevationRange; // Optional elevation range for the whole tile. Not to be confused with elevation range per layer.
#endif

#if defined(ENABLE_HILLSHADING)
uniform float       zenith;     // Zenith of sunlight, in degrees (0 - 90)
uniform float       azimuth;    // Azimuth on sunlight, in degrees (0 - 360)
#endif

uniform vec2        tileDimensions; // The dimensions of the tile, in CRS units

#if defined(ELEVATION_LAYER)
uniform sampler2D   elevationTexture;
uniform LayerInfo   elevationLayer;
uniform ColorMap    elevationColorMap;  // The elevation layer's optional color map
#endif

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

vec2 computeDerivatives(vec2 uv, sampler2D texture, vec2 textureSize, vec4 offsetScale) {
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
    float a = getElevation(texture, uv + vec2(-width, height));
    float b = getElevation(texture, uv + vec2( 0.0, height));
    float c = getElevation(texture, uv + vec2( width, height));
    float d = getElevation(texture, uv + vec2(-width, 0.0));
    float f = getElevation(texture, uv + vec2( width, 0.0));
    float g = getElevation(texture, uv + vec2(-width, -height));
    float h = getElevation(texture, uv + vec2( 0.0, -height));
    float i = getElevation(texture, uv + vec2( width, -height));

    float cellWidth = tileDimensions.x / (offsetScale.z * textureSize.x);
    float cellHeight = tileDimensions.y / (offsetScale.w * textureSize.y);
    float dzdx = ((c + 2.0 * f + i) - (a + 2.0 * d + g)) / (8.0 * cellWidth);
    float dzdy = ((g + 2.0 * h + i) - (a + 2.0 * b + c)) / (8.0 * cellHeight);

    return vec2(dzdx, dzdy);
}

float calcSlope( vec2 derivatives ) {
    // https://desktop.arcgis.com/en/arcmap/10.3/tools/spatial-analyst-toolbox/how-slope-works.htm
    return atan(sqrt(derivatives.x * derivatives.x + derivatives.y * derivatives.y)); // In radians
}

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

vec4 encodeHalfRGBA ( vec2 v ) {
	vec4 encoded = vec4( 0.0 );
	const vec2 offset = vec2( 1.0 / 255.0, 0.0 );
	encoded.xy = vec2( v.x, fract( v.x * 255.0 ) );
	encoded.xy = encoded.xy - ( encoded.yy * offset );
	encoded.zw = vec2( v.y, fract( v.y * 255.0 ) );
	encoded.zw = encoded.zw - ( encoded.ww * offset );
	return encoded;
}
vec2 decodeHalfRGBA( vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}

#if defined(ENABLE_HILLSHADING)
float calcHillshade(LayerInfo layer, sampler2D texture, vec2 uv){
    // https://desktop.arcgis.com/en/arcmap/10.3/tools/spatial-analyst-toolbox/how-hillshade-works.htm
    vec2 derivatives = computeDerivatives(uv, texture, layer.textureSize, layer.offsetScale);
    float slope = calcSlope(derivatives);
    float aspect = calcAspect(derivatives);
    float zenith_rad = zenith * M_PI / 180.0; // in radians
    float azimuth_rad = azimuth * M_PI / 180.0; // in radians
    float hillshade = ((cos(zenith_rad) * cos(slope)) + (sin(zenith_rad) * sin(slope) * cos(azimuth_rad - aspect)));
    return clamp(hillshade, 0., 1.);
}
#endif

vec4 blend(vec4 fore, vec4 back) {
    if (fore.a == 0. && back.a == 0.) {
        return vec4(0);
    }
    float alpha = fore.a + back.a * (1.0 - fore.a);
    vec3 color = (fore.rgb * fore.a) + back.rgb * (back.a * (1.0 - fore.a)) / alpha;

    return vec4(color, alpha);
}

vec4 computeColor(vec2 rawUv, vec4 offsetScale, sampler2D texture) {
    vec2 uv = computeUv(rawUv, offsetScale.xy, offsetScale.zw);
    return texture2D(texture, uv);
}

float map(float value, float min1, float max1, float min2, float max2) {
    return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

#if defined(ENABLE_OUTLINES)
vec4 drawTileOutlines(vec2 uv, vec4 color) {
    const vec4 GREEN = vec4(0, 1, 0, 1);
    const vec4 BLUE = vec4(0, 0, 1, 1);
    const vec4 RED = vec4(1, 0, 0, 1);
    const vec4 YELLOW = vec4(1, 1, 0, 1);

    if (uv.x < OUTLINE_THICKNESS) { // WEST
        color = RED;
    } else if (uv.x > 1.0 - OUTLINE_THICKNESS) { // EAST
        color = GREEN;
    } else if (uv.y < OUTLINE_THICKNESS) { // NORTH
        color = BLUE;
    } else if (uv.y > 1.0 - OUTLINE_THICKNESS) { // SOUTH
        color = YELLOW;
    }

    return color;
}
#endif

vec4 computeColorMap(
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
        vec2 derivatives = computeDerivatives(uv, sampledTexture, layer.textureSize, layer.offsetScale);
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

vec4 computeColorLayer(
    sampler2D atlas,
    sampler2D lut,
    LayerInfo layer,
    ColorMap colorMap,
    vec2 uv
) {
    if (layer.offsetScale.zw != vec2(0.0)) {
        vec4 color;
        if (colorMap.mode != COLORMAP_MODE_DISABLED) {
            color = computeColorMap(layer, atlas, colorMap, lut, uv);
        } else {
            color = computeColor(uv, layer.offsetScale, atlas);
        }
        vec3 rgb = color.rgb * layer.color.rgb;
        float a = color.a * layer.color.a;
        return vec4(rgb, a);
    }

    return vec4(0);
}

// Compose the layer color with the background, according to the mode.
vec4 composeLayer(vec4 background, vec4 layer, int mode) {
    vec4 blended;

#if defined(ENABLE_LAYER_MASKS)
    if (mode == LAYER_MODE_NORMAL) {
        blended = blend(layer, background);
    } else if (mode == LAYER_MODE_MASK) {
        // The layer acts like a mask : ignore the color, only use its transparency.
        blended = vec4(background.rgb, background.a * layer.a);
    } else if (mode == LAYER_MODE_MASK_INVERTED) {
        blended = vec4(background.rgb, background.a * (1.0 - layer.a));
    }
#else
    blended = blend(layer, background);
#endif

    return blended;
}

void main() {
    gl_FragColor = vec4(0.0);

    // Step 0 : discard fragment in trivial cases of transparency
    if (opacity == 0.) {
        discard;
    }

    float height = 0.;

#if defined(ELEVATION_LAYER)
    vec2 elevUv = computeUv(vUv, elevationLayer.offsetScale.xy, elevationLayer.offsetScale.zw);
    height = getElevation(elevationTexture, elevUv);
#endif

#if defined(ENABLE_ELEVATION_RANGE)
    if (clamp(height, elevationRange.x, elevationRange.y) != height) {
        discard;
    }
#endif

    // Step 1 : discard fragment if the elevation texture is transparent
#if defined(DISCARD_NODATA_ELEVATION)
#if defined(ELEVATION_LAYER)
    // Let's discard transparent pixels in the elevation texture
    // Important note : if there is no elevation texture, all fragments are discarded
    // because the default value for texture pixels is zero.
    if (abs(texture2D(elevationTexture, elevUv).a) < 0.001) {
        discard;
    }
#else
    // No elevation layer present, discard completely.
    discard;
#endif
#endif

    // Step 2 : start with the background color
    vec4 diffuseColor = backgroundColor;

#if defined(ELEVATION_LAYER)
    // Step 3 : if the elevation layer has a color map, use it as the background color.
    if (elevationColorMap.mode != COLORMAP_MODE_DISABLED) {
        vec3 rgb = computeColorMap(
            elevationLayer,
            elevationTexture,
            elevationColorMap,
            luts,
            vUv).rgb;
        diffuseColor = blend(vec4(rgb, 1.0), diffuseColor);
    }
#endif

    // Step 4 : process all color layers (either directly sampling the atlas texture, or use a color map).
#if COLOR_LAYERS
    #pragma unroll_loop_start
    for (int i = 0; i < COLOR_LAYERS; i++) {
        LayerInfo layer = layers[i];
        if (layer.color.a > 0.) {
            ColorMap colorMap = layersColorMaps[i];
            vec4 rgba = computeColorLayer(colorTexture, luts, layer, colorMap, vUv);
            vec4 blended = composeLayer(diffuseColor, rgba, layer.mode);

#if defined(ENABLE_ELEVATION_RANGE)
            vec2 range = layer.elevationRange;
            if (clamp(height, range.x, range.y) == height) {
                diffuseColor = blended;
            }
#else
            diffuseColor = blended;
#endif
        }
    }
    #pragma unroll_loop_end
#endif

    diffuseColor.a *= opacity;

#if defined(ELEVATION_LAYER)
    // Step 5 : apply shading
#if defined(ENABLE_HILLSHADING)
    float hillshade = calcHillshade(elevationLayer, elevationTexture, elevUv);
    diffuseColor.rgb *= hillshade;
#endif
#endif

    // Step 6 : apply backface processing.
    if (!gl_FrontFacing) {
        // Display the backside in a desaturated, darker tone, to give visual feedback that
        // we are, in fact, looking at the map from the "wrong" side.
        diffuseColor.rgb = desaturate(diffuseColor.rgb, 1.) * 0.5;
    }

    // Step 7 : draw tile outlines
#if defined(ENABLE_OUTLINES)
    diffuseColor = drawTileOutlines(vUv, diffuseColor);
#endif

    // Final step : process rendering states.
    if (diffuseColor.a <= 0.) {
        // The fragment is transparent, discard it to short-circuit rendering state evaluation.
        discard;
    } else if (renderingState == STATE_FINAL) {
        gl_FragColor = diffuseColor;
    } else if (renderingState == STATE_ID) {
        gl_FragColor = packDepthToRGBA(float(uuid) / (256.0 * 256.0 * 256.0));
    } else if (renderingState == STATE_DEPTH) {
        gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
    } else if (renderingState == STATE_Z) {
        // Since packing does not support negative values,
        // We offset the height to guarantee a positive value.
        // This should be offset back to -20000 in the decoding JS code.
        float offsetHeight = height + 20000.0;
        gl_FragColor = packDepthToRGBA(offsetHeight / (256.0 * 256.0 * 256.0));
    } else if (renderingState == STATE_UV) {
        gl_FragColor = encodeHalfRGBA(vUv);
    }
}
