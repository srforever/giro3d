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
 */
const int STATE_FINAL = 0;
const int STATE_DEPTH = 1;
const int STATE_ID = 2;
const int STATE_UV = 3;

varying vec2        vUv; // The input UV

uniform int         renderingState; // Current rendering state (default is STATE_FINAL)
uniform int         uuid;           // The ID of the tile mesh (used for the STATE_ID rendering state)

#if COLOR_LAYERS
uniform sampler2D   colorTexture;         // Atlas texture shared among color layers
uniform LayerInfo   layers[COLOR_LAYERS]; // The color layers' infos
uniform ColorMap    layersColorMaps[COLOR_LAYERS]; // The color layers' color maps
uniform sampler2D   luts[COLOR_LAYERS]; // The color layers' color maps LUTs
#endif

uniform float       opacity;        // The entire map opacity
uniform vec3        backgroundColor; // The background color

#if defined(ENABLE_OUTLINES)
const float         OUTLINE_THICKNESS = 0.003;
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
uniform sampler2D   elevationLut;       // The elevation layer's color map LUT
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

vec3 blend(vec3 fore, vec3 back, float a) {
    return mix(back.rgb, fore.rgb, a);
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

vec3 computeColorMap(
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
    vec4 color = texture2D(lut, vec2(t, 0.0));
    return color.rgb;
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
            color.rgb = computeColorMap(layer, atlas, colorMap, lut, uv);
            color.a = 1.;
        } else {
            color = computeColor(uv, layer.offsetScale, atlas);
        }
        vec3 rgb = color.rgb * layer.color.rgb;
        float a = color.a * layer.color.a;
        return vec4(rgb, a);
    }

    return vec4(0);
}

void main() {
    // Step 0 : discard fragment in trivial cases of transparency
    if (opacity == 0.) {
        discard;
    }

#if defined(ELEVATION_LAYER)
    vec2 elevUv = computeUv(vUv, elevationLayer.offsetScale.xy, elevationLayer.offsetScale.zw);
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
    vec4 diffuseColor = vec4(backgroundColor, opacity);

#if defined(ELEVATION_LAYER)
    // Step 3 : if the elevation layer has a color map, use it as the background color.
    if (elevationColorMap.mode != COLORMAP_MODE_DISABLED) {
        diffuseColor.rgb = computeColorMap(
            elevationLayer,
            elevationTexture,
            elevationColorMap,
            elevationLut,
            vUv);
    }
#endif

    // Step 4 : process all color layers (either directly sampling the atlas texture, or use a color map).
#if COLOR_LAYERS
    #pragma unroll_loop_start
    for (int i = 0; i < COLOR_LAYERS; i++) {
        LayerInfo layer = layers[i];
        if (layer.color.a > 0.) {
            ColorMap colorMap = layersColorMaps[i];
            vec4 rgba = computeColorLayer(colorTexture, luts[i], layer, colorMap, vUv);
            diffuseColor.rgb = blend(rgba.rgb, diffuseColor.rgb, rgba.a);
        }
    }
    #pragma unroll_loop_end
    diffuseColor.a *= opacity;
#endif

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
    } else if (renderingState == STATE_UV) {
        gl_FragColor = encodeHalfRGBA(vUv);
    }
}
