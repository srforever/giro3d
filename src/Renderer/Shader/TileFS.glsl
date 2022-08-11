#include <PrecisionQualifier>

uniform int renderingState;
uniform sampler2D colorTexture;

#if TEX_UNITS
uniform vec4      colorOffsetScale[TEX_UNITS];
uniform float     colorOpacity[TEX_UNITS];
uniform bool      colorVisible[TEX_UNITS];
uniform vec3      colors[TEX_UNITS];
#endif

// backgroundColor
uniform float      noTextureOpacity;
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

#if defined(DEBUG)
uniform bool showOutline;
const float sLine = 0.003;
#endif

#include <ComputeUV>

#include <packing>
uniform int  uuid;

void main() {
    if (renderingState == 2) {
        gl_FragColor = packDepthToRGBA(float(uuid) / (256.0 * 256.0 * 256.0));
    } else if (renderingState == 1) {
        gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
    } else if (renderingState == 3) {
        gl_FragColor = encodeHalfRGBA(vUv);
    } else {

        vec4 diffuseColor = vec4(noTextureColor, 0.0);

        bool hasTexture = false;

        #if TEX_UNITS
        #pragma unroll_loop_start
        for (int i = 0; i < TEX_UNITS; i++) {
            if (colorVisible[i] && colorOpacity[i] > 0.0 && colorOffsetScale[i].zw != vec2(0.0)) {
                vec2 uv = computeUv(vUv, colorOffsetScale[i].xy, colorOffsetScale[i].zw);
                vec4 layerColor = texture2D(colorTexture, uv);
                if (layerColor.a > 0.0) {
                    hasTexture = true;
                }
                layerColor.rgb *= colors[i];
                diffuseColor = diffuseColor * (1.0 - layerColor.a * colorOpacity[i]) + layerColor * colorOpacity[i];
            }
        }
        #pragma unroll_loop_end
        #endif


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

        // gl_FragColor.rgb = mix(gl_FragColor.rgb, vColor.rgb, vColor.a);
        if (hasTexture) {
            gl_FragColor.a = max(gl_FragColor.a, noTextureOpacity);
        } else {
            gl_FragColor = vec4(noTextureColor, noTextureOpacity);
        }

#if defined(DEBUG)
        if (showOutline && (vUv.x < sLine || vUv.x > 1.0 - sLine || vUv.y < sLine || vUv.y > 1.0 - sLine)) {
            gl_FragColor.rgb = mix(vec3(1.0, 0.0, 0.0), gl_FragColor.rgb, 0.2);
        }
#endif

    }

}
