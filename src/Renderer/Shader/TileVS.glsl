#include <logdepthbuf_pars_vertex>
#define EPSILON 1e-6

const float PI          = 3.14159265359;
const float INV_TWO_PI  = 1.0 / (2.0*PI);
const float PI4         = 0.78539816339;

attribute vec3      position;
attribute vec2      uv;
attribute vec3      normal;

uniform sampler2D   dTextures_00[1];
uniform vec4        offsetScale_L00[1];
uniform int         loadedTexturesCount[8];

uniform mat4        projectionMatrix;
uniform mat4        modelViewMatrix;
uniform mat4        modelMatrix;
uniform vec2    tileDimensions;

varying vec2        vUv;
varying vec3        vNormal;
varying vec4        pos;
varying vec3        vColor;

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

void main() {

        vUv = uv;
        vec4 vPosition;

        vColor = vec3(1.0, 1.0, 1.0);

        if(loadedTexturesCount[0] > 0) {
            vec2    vVv = vec2(
                vUv.x * offsetScale_L00[0].z + offsetScale_L00[0].x,
                (1.0 - vUv.y) * offsetScale_L00[0].w + offsetScale_L00[0].y);

            vec2 onePixel = offsetScale_L00[0].zw / 256.0;

            float a = getElevation(vVv + onePixel * vec2(-1.0, 1.0));
            float b = getElevation(vVv + onePixel * vec2( 0.0, 1.0));
            float c = getElevation(vVv + onePixel * vec2( 1.0, 1.0));
            float d = getElevation(vVv + onePixel * vec2(-1.0, 0.0));
            float e = getElevation(vVv + onePixel * vec2( 0.0, 0.0));
            float f = getElevation(vVv + onePixel * vec2( 1.0, 0.0));
            float g = getElevation(vVv + onePixel * vec2(-1.0, -1.0));
            float h = getElevation(vVv + onePixel * vec2( 0.0, -1.0));
            float i = getElevation(vVv + onePixel * vec2( 1.0, -1.0));

            float dv = e;

            float hillshade = calcHillshade(a, b, c, d, e, f, g, h, i, offsetScale_L00[0].zw * 256.0);
            vColor = vec3(hillshade, hillshade, hillshade);

            vPosition = vec4( position +  normal * dv ,1.0 );
        } else {
            vPosition = vec4( position ,1.0 );
        }

        vNormal = normalize ( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );

        gl_Position = projectionMatrix * modelViewMatrix * vPosition;
        #include <logdepthbuf_vertex>
}
