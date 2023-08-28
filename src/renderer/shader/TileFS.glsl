#include <giro3d_precision_qualifiers>
#include <giro3d_common>

#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

/**
 * Map tile fragment shader.
 */

/**
 * Rendering states are modes that change the kind of data that the fragment shader outputs.
 * - FINAL : the FS outputs the regular object's color and aspect. This is the default.
 * - PICKING : the FS outputs (ID, Z, U, V) as Float32 color
 */
const int STATE_FINAL = 0;
const int STATE_PICKING = 1;

varying vec2        vUv; // The input UV

uniform int         renderingState; // Current rendering state (default is STATE_FINAL)
uniform int         uuid;           // The ID of the tile mesh (used for the STATE_PICKING rendering state)

uniform float       opacity;        // The entire map opacity
uniform vec4        backgroundColor; // The background color

#include <giro3d_colormap_pars_fragment>
#include <giro3d_outline_pars_fragment>
#include <giro3d_compose_layers_pars_fragment>

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

void main() {
    #include <clipping_planes_fragment>

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
    gl_FragColor = backgroundColor;

#if defined(ELEVATION_LAYER)
    // Step 3 : if the elevation layer has a color map, use it as the background color.
    if (elevationColorMap.mode != COLORMAP_MODE_DISABLED) {
        vec3 rgb = computeColorMap(
            tileDimensions,
            elevationLayer,
            elevationTexture,
            elevationColorMap,
            colorMapAtlas,
            vUv).rgb;
        gl_FragColor = blend(vec4(rgb, 1.0), gl_FragColor);
    }
#endif

    float hillshade = 1.;

#if defined(ELEVATION_LAYER)
    // Step 5 : compute shading
#if defined(ENABLE_HILLSHADING)
    hillshade = calcHillshade(tileDimensions, elevationLayer.textureSize, zenith, azimuth, elevationLayer.offsetScale, elevationTexture, elevUv);
#endif
#endif

// Shading can be applied either:
// - before the color layers (i.e only the background pixels will be shaded)
// - or after the color layers (i.e all pixels will be shaded).
#if defined(APPLY_SHADING_ON_COLORLAYERS)
#else
    gl_FragColor.rgb *= hillshade;
#endif

    // Step 4 : process all color layers (either directly sampling the atlas texture, or use a color map).
    #include <giro3d_compose_layers_fragment>

#if defined(APPLY_SHADING_ON_COLORLAYERS)
    gl_FragColor.rgb *= hillshade;
#endif

    gl_FragColor.a *= opacity;

    // Step 6 : apply backface processing.
    if (!gl_FrontFacing) {
        // Display the backside in a desaturated, darker tone, to give visual feedback that
        // we are, in fact, looking at the map from the "wrong" side.
        gl_FragColor.rgb = desaturate(gl_FragColor.rgb, 1.) * 0.5;
    }

    // Step 7 : draw tile outlines
    #include <giro3d_outline_fragment>

    #include <logdepthbuf_fragment>

    // Final step : process rendering states.
    if (gl_FragColor.a <= 0.) {
        // The fragment is transparent, discard it to short-circuit rendering state evaluation.
        discard;
    } else if (renderingState == STATE_FINAL) {
        gl_FragColor = gl_FragColor;
    } else if (renderingState == STATE_PICKING) {
        float id = float(uuid);
        float z = height;
        float u = vUv.x;
        float v = vUv.y;
        // Requires a float32 render target
        gl_FragColor = vec4(id, z, u, v);
    }
}
