#include <PrecisionQualifier>

uniform sampler2D colorTexture[TEX_UNITS];
uniform vec4      colorOffsetScale[TEX_UNITS];
uniform float     colorOpacity[TEX_UNITS];
uniform bool      colorVisible[TEX_UNITS];

// backgroundColor
uniform vec3      noTextureColor;
// tile opacity
uniform float     opacity;

varying vec2        vUv;


#if defined(HILLSHADE)
// hillshade support
uniform sampler2D   elevationTexture;
uniform vec4        elevationOffsetScale;
uniform vec2 tileDimensions;

#include <GetElevation>

float ZENITH = 0.7857142857;
float AZIMUTH = 2.3571428571;

#define M_PI 3.1415926535897932384626433832795

// from https://github.com/PropellerAero/cesium-elevation-gradient/blob/master/lib/shaders/elevationGradientFrag.glsl
float calcHillshade(float a, float b, float c, float d, float e, float f, float g, float h, float i, vec2 onePixel){
    vec2 cellsize = tileDimensions / onePixel;
    // http://edndoc.esri.com/arcobjects/9.2/net/shared/geoprocessing/spatial_analyst_tools/how_hillshade_works.htm

    float dzdx = ((c + 2.0 * f + i) - (a + 2.0 * d + g)) / (8.0 * cellsize.x);
    float dzdy = ((g + 2.0 * h + i) - (a + 2.0 * b + c)) / (8.0 * cellsize.y);
    float slope = atan(1.0 * sqrt(dzdx * dzdx + dzdy * dzdy));

    float aspect = atan(dzdy, -dzdx);

    if(aspect < 0.0){
        aspect = aspect +  2.0 * M_PI;
    }

    float hillshade = ((cos(ZENITH) * cos(slope)) + (sin(ZENITH) * sin(slope) * cos(AZIMUTH - aspect)));
    return clamp(hillshade, 0., 1.);
}
#endif


#if defined(DEBUG)
uniform bool showOutline;
const float sLine = 0.008;
#endif

#if defined(MATTE_ID_MODE) || defined(DEPTH_MODE)
#include <packing>
uniform int  uuid;
#endif

void main() {
    #if defined(MATTE_ID_MODE)
        gl_FragColor = packDepthToRGBA(float(uuid) / (256.0 * 256.0 * 256.0));
    #elif defined(DEPTH_MODE)
        gl_FragColor = packDepthToRGBA(gl_FragCoord.z / gl_FragCoord.w);
    #else

    #if defined(DEBUG)
     if (showOutline && (vUv.x < sLine || vUv.x > 1.0 - sLine || vUv.y < sLine || vUv.y > 1.0 - sLine)) {
         gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
         return;
     }
    #endif

    vec4 diffuseColor = vec4(noTextureColor, 0.0);

    for (int i = 0; i < TEX_UNITS; i++) {
        if (!colorVisible[i] || colorOpacity[i] <= 0.0) {
            continue;
        }

        vec2 uv;
        uv.x = vUv.x * colorOffsetScale[i].z + colorOffsetScale[i].x;
        uv.y = 1.0 - ((1.0 - vUv.y) * colorOffsetScale[i].w + colorOffsetScale[i].y);

        vec4 layerColor = texture2D(colorTexture[i], uv);

        // Use premultiplied-alpha blending formula because source textures are either:
        //     - fully opaque (layer.transparent = false)
        //     - or use premultiplied alpha (texture.premultiplyAlpha = true)
        // Note: using material.premultipliedAlpha doesn't make sense since we're manually blending
        // the multiple colors in the shader.
        diffuseColor = diffuseColor * (1.0 - layerColor.a * colorOpacity[i]) + layerColor * colorOpacity[i];
    }
    gl_FragColor = diffuseColor;


    #if defined(HILLSHADE)
    vec2 onePixel = vec2(1.0) / 256.0;

    vec2 vVv = vec2(
        vUv.x * elevationOffsetScale.z + elevationOffsetScale.x,
        (1.0 - vUv.y) * elevationOffsetScale.w + elevationOffsetScale.y);

    float a = getElevation(elevationTexture, vVv + onePixel * vec2(-1.0, 1.0));
    float b = getElevation(elevationTexture, vVv + onePixel * vec2( 0.0, 1.0));
    float c = getElevation(elevationTexture, vVv + onePixel * vec2( 1.0, 1.0));
    float d = getElevation(elevationTexture, vVv + onePixel * vec2(-1.0, 0.0));
    float e = getElevation(elevationTexture, vVv + onePixel * vec2( 0.0, 0.0));
    float f = getElevation(elevationTexture, vVv + onePixel * vec2( 1.0, 0.0));
    float g = getElevation(elevationTexture, vVv + onePixel * vec2(-1.0, -1.0));
    float h = getElevation(elevationTexture, vVv + onePixel * vec2( 0.0, -1.0));
    float i = getElevation(elevationTexture, vVv + onePixel * vec2( 1.0, -1.0));

    float hillshade = calcHillshade(a, b, c, d, e, f, g, h, i, elevationOffsetScale.zw * 256.0);

    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(hillshade), 0.75);
    #endif

    gl_FragColor.a = 1.0;
    #endif
}
