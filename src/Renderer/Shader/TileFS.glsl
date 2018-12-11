#include <PrecisionQualifier>

uniform sampler2D colorTexture;

#if TEX_UNITS
uniform vec4      colorOffsetScale[TEX_UNITS];
uniform float     colorOpacity[TEX_UNITS];
uniform bool      colorVisible[TEX_UNITS];
#endif

// backgroundColor
uniform vec3      noTextureColor;
// tile opacity
uniform float     opacity;

varying vec2        vUv;
varying vec4 vColor;
varying vec4 vPosition;

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
const float sLine = 0.003;
#endif

#include <ComputeUV>

#if defined(MATTE_ID_MODE) || defined(DEPTH_MODE)
#include <packing>
uniform int  uuid;
#endif

void main() {
    #if defined(MATTE_ID_MODE)
        gl_FragColor = packDepthToRGBA(float(uuid) / (256.0 * 256.0 * 256.0));
    #elif defined(DEPTH_MODE)
        gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
    #else

    vec4 diffuseColor = vec4(noTextureColor, 0.0);
    // diffuseColor.rgb = vec3(vPosition.z / 129.0);

    // We can't loop here over textures since Firefox doesn't support
    // reading from a sampler array without a constant index
    // (ie texture2D(texture[i], uv) is disallowed).
    INSERT_TEXTURE_READING_CODE
    // Instead we generate the unrolled loop when needed and insert it
    // here (see LayeredMaterial.js).

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

    gl_FragColor.rgb *= hillshade;
    #endif

    gl_FragColor.rgb = mix(gl_FragColor.rgb, vColor.rgb, vColor.a);
    gl_FragColor.a = opacity;

    #if defined(DEBUG)
    if (showOutline && (vUv.x < sLine || vUv.x > 1.0 - sLine || vUv.y < sLine || vUv.y > 1.0 - sLine)) {
        gl_FragColor.rgb = mix(vec3(1.0, 0.0, 0.0), gl_FragColor.rgb, 0.2);
    }
    #endif
    #endif

    // iso line
    float coord = vPosition.z;
    float coord_10 = coord * 0.1;
    float line_10 = abs(fract(coord_10 - 0.5) - 0.5) / fwidth(coord_10);
    // gl_FragColor.xyz *= max(0.8, min(line_10, 1.0));
}
