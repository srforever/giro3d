#include <logdepthbuf_pars_fragment>

// BUG CHROME 50 UBUNTU 16.04
// Lose context on compiling shader with too many IF STATEMENT
// runconformance/glsl/bugs/conditional-discard-in-loop.html
// conformance/glsl/bugs/nested-loops-with-break-and-continue.html
// Resolve CHROME unstable 52

const vec4 CFog = vec4( 0.76, 0.85, 1.0, 1.0);
const vec4 CWhite = vec4(1.0,1.0,1.0,1.0);
const vec4 COrange = vec4( 1.0, 0.3, 0.0, 1.0);
const vec4 CRed = vec4( 1.0, 0.0, 0.0, 1.0);


uniform sampler2D   dTextures_00[1];
uniform vec4        offsetScale_L00[1];
uniform sampler2D   dTextures_01[TEX_UNITS];
uniform vec4        offsetScale_L01[TEX_UNITS];

// offset texture | Projection | fx | Opacity
uniform vec4        paramLayers[8];
uniform bool        visibility[8];

uniform float       distanceFog;
uniform int         colorLayersCount;

uniform vec3        noTextureColor;

// Options global
uniform bool        selected;

varying vec2        vUv;
varying vec3        vNormal;

uniform float opacity;
uniform vec2    tileDimensions;

highp float decode32(highp vec4 rgba) {
    highp float Sign = 1.0 - step(128.0,rgba[0])*2.0;
    highp float Exponent = 2.0 * mod(rgba[0],128.0) + step(128.0,rgba[1]) - 127.0;
    highp float Mantissa = mod(rgba[1],128.0)*65536.0 + rgba[2]*256.0 +rgba[3] + float(0x800000);
    highp float Result =  Sign * exp2(Exponent) * (Mantissa * exp2(-23.0 ));
    return Result;
}

float getElevation(vec2 uv) {
    #if defined(DATA_TEXTURE_ELEVATION)
        return max(texture2D(dTextures_00[0], uv).w, 0.);
    #elif defined(COLOR_TEXTURE_ELEVATION)
        vec4 color = texture2D(dTextures_00[0], uv) * (255.0 * 0.1);
        return
            -10000.0 +
            color.r * 256.0 * 256.0 +
            color.g * 256.0 +
            color.b;

    #else
    #error Must define either DATA_TEXTURE_ELEVATION or COLOR_TEXTURE_ELEVATION
    #endif
}

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


vec4 applyWhiteToInvisibleEffect(vec4 color, float intensity) {
    float a = (color.r + color.g + color.b) * 0.333333333;
    color.a *= 1.0 - pow(abs(a), intensity);
    return color;
}

vec4 applyLightColorToInvisibleEffect(vec4 color, float intensity) {
    float a = max(0.05,1.0 - length(color.xyz - CWhite.xyz));
    color.a *= 1.0 - pow(abs(a), intensity);
    color.rgb *= color.rgb * color.rgb;
    return color;
}

#if defined(DEBUG)
    uniform bool showOutline;
    const float sLine = 0.008;
#endif

#if defined(MATTE_ID_MODE) || defined(DEPTH_MODE)
#include <packing>
uniform int  uuid;
#endif

void main() {
    #include <logdepthbuf_fragment>

    #if defined(MATTE_ID_MODE)
        gl_FragColor = packDepthToRGBA(float(uuid) / (256.0 * 256.0 * 256.0));
    #elif defined(DEPTH_MODE)
        #if defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)
            float z = gl_FragDepthEXT ;
        #else
            float z = gl_FragCoord.z;
        #endif
        gl_FragColor = packDepthToRGBA(z);
    #else


    #if defined(DEBUG)
         if (showOutline && (vUv.x < sLine || vUv.x > 1.0 - sLine || vUv.y < sLine || vUv.y > 1.0 - sLine))
             gl_FragColor = CRed;
         else
    #endif
    {
        #if defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)
            float depth = gl_FragDepthEXT / gl_FragCoord.w;
        #else
            float depth = gl_FragCoord.z / gl_FragCoord.w;
        #endif

        float fogIntensity = 1.0/(exp(depth/distanceFog));

        vec4 diffuseColor = vec4(noTextureColor, 1.0);
        bool validTexture = false;

        // TODO Optimisation des uv1 peuvent copier pas lignes!!
        for (int layer = 0; layer < 8; layer++) {
            if(layer == colorLayersCount) {
                break;
            }

            if(visibility[layer]) {
                vec4 paramsA = paramLayers[layer];

                if(paramsA.w > 0.0) {
                    int textureIndex = int(paramsA.x);

                    {
                        vec4 layerColor = colorAtIdUv(
                            dTextures_01,
                            offsetScale_L01,
                            textureIndex,
                            vUv);

                        if (layerColor.a > 0.0 && paramsA.w > 0.0) {
                            validTexture = true;
                            if(paramsA.z > 2.0) {
                                layerColor.rgb /= layerColor.a;
                                layerColor = applyLightColorToInvisibleEffect(layerColor, paramsA.z);
                                layerColor.rgb *= layerColor.a;
                            } else if(paramsA.z > 0.0) {
                                layerColor.rgb /= layerColor.a;
                                layerColor = applyWhiteToInvisibleEffect(layerColor, paramsA.z);
                                layerColor.rgb *= layerColor.a;
                            }

                            // Use premultiplied-alpha blending formula because source textures are either:
                            //     - fully opaque (layer.transparent = false)
                            //     - or use premultiplied alpha (texture.premultiplyAlpha = true)
                            // Note: using material.premultipliedAlpha doesn't make sense since we're manually blending
                            // the multiple colors in the shader.
                            diffuseColor = diffuseColor * (1.0 - layerColor.a * paramsA.w) + layerColor * paramsA.w;
                        }
                    }
                }
            }
        }

        // No texture color
        if (!validTexture) {
            diffuseColor.rgb = noTextureColor;
        }

        // Selected
        if(selected) {
            diffuseColor = mix(COrange, diffuseColor, 0.5 );
        }

        // Fog
        gl_FragColor = mix(CFog, diffuseColor, fogIntensity);
        gl_FragColor.a = 1.0;
    }

    // hillshade
    vec2 onePixel = vec2(1.0) / 256.0;

    vec2    vVv = vec2(
        vUv.x * offsetScale_L00[0].z + offsetScale_L00[0].x,
        (1.0 - vUv.y) * offsetScale_L00[0].w + offsetScale_L00[0].y);

    float a = getElevation(vVv + onePixel * vec2(-1.0, 1.0));
    float b = getElevation(vVv + onePixel * vec2( 0.0, 1.0));
    float c = getElevation(vVv + onePixel * vec2( 1.0, 1.0));
    float d = getElevation(vVv + onePixel * vec2(-1.0, 0.0));
    float e = getElevation(vVv + onePixel * vec2( 0.0, 0.0));
    float f = getElevation(vVv + onePixel * vec2( 1.0, 0.0));
    float g = getElevation(vVv + onePixel * vec2(-1.0, -1.0));
    float h = getElevation(vVv + onePixel * vec2( 0.0, -1.0));
    float i = getElevation(vVv + onePixel * vec2( 1.0, -1.0));

    float hillshade = calcHillshade(a, b, c, d, e, f, g, h, i, offsetScale_L00[0].zw * 256.0);

    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(hillshade), 0.85);
    gl_FragColor.a = opacity;
    #endif
}
