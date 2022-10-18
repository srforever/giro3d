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
// tile opacity - UNUSED
// uniform float     opacity;

varying vec2        vUv;
varying vec4 vColor;
varying vec4 vPosition;

#include <GetElevation>
uniform sampler2D elevationTexture;
uniform vec4      elevationOffsetScale;
uniform vec2      tileDimensions;
#define M_PI 3.1415926535897932384626433832795

#include <ComputeUV>

#include <packing>
uniform int  uuid;

vec2 computeDerivatives() {
    // Maybe could be done with dFdx and dFdy of the derivatives extension ?
    vec2 onePixel = vec2(1.0) / 256.0;
    vec2 vVv = computeUv(vUv, elevationOffsetScale.xy, elevationOffsetScale.zw);
    float a = getElevation(elevationTexture, vVv + onePixel * vec2(-1.0, 1.0));
    float b = getElevation(elevationTexture, vVv + onePixel * vec2( 0.0, 1.0));
    float c = getElevation(elevationTexture, vVv + onePixel * vec2( 1.0, 1.0));
    float d = getElevation(elevationTexture, vVv + onePixel * vec2(-1.0, 0.0));
    float e = getElevation(elevationTexture, vVv + onePixel * vec2( 0.0, 0.0));
    float f = getElevation(elevationTexture, vVv + onePixel * vec2( 1.0, 0.0));
    float g = getElevation(elevationTexture, vVv + onePixel * vec2(-1.0, -1.0));
    float h = getElevation(elevationTexture, vVv + onePixel * vec2( 0.0, -1.0));
    float i = getElevation(elevationTexture, vVv + onePixel * vec2( 1.0, -1.0));
    vec2 cellsize = tileDimensions / (elevationOffsetScale.zw * 256.0);
    float dzdx = ((c + 2.0 * f + i) - (a + 2.0 * d + g)) / (8.0 * cellsize.x);
    float dzdy = ((g + 2.0 * h + i) - (a + 2.0 * b + c)) / (8.0 * cellsize.y);
    return vec2(dzdx, dzdy);
}

float calcSlope( vec2 derivatives ) {
    // https://desktop.arcgis.com/en/arcmap/10.3/tools/spatial-analyst-toolbox/how-slope-works.htm
    return atan(sqrt(derivatives.x * derivatives.x + derivatives.y * derivatives.y)); // In radians
}

float calcAspect ( vec2 derivatives ) {
    // https://desktop.arcgis.com/en/arcmap/10.3/tools/spatial-analyst-toolbox/how-aspect-works.htm
    float aspect = atan(derivatives.y, -derivatives.x);
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

#if defined(HILLSHADE)
// hillshade support
uniform float zenith; // degrees (0 - 90)
uniform float azimuth; // degrees (0 - 360)
float calcHillshade(){
    // https://desktop.arcgis.com/en/arcmap/10.3/tools/spatial-analyst-toolbox/how-hillshade-works.htm
    vec2 derivatives = computeDerivatives();
    float slope = calcSlope(derivatives);
    float aspect = calcAspect(derivatives);
    float zenith_rad = zenith * M_PI / 180.0; // in radians
    float azimuth_rad = azimuth * M_PI / 180.0; // in radians
    float hillshade = ((cos(zenith_rad) * cos(slope)) + (sin(zenith_rad) * sin(slope) * cos(azimuth_rad - aspect)));
    return clamp(hillshade, 0., 1.);
}
#endif

#if defined(COLORMAP)
// attribute vec3 normal;
uniform int       colormapMode;
uniform float     colormapMin;
uniform float     colormapMax;
uniform sampler2D vLut;
#endif

#if defined(DEBUG)
uniform bool showOutline;
const float sLine = 0.003;
#endif

void main() {

#if defined(DISCARD_NODATA_ELEVATION)
    // Let's discard transparent pixels in the elevation texture
    // Important note : if there is no elevation texture, all fragments are discarded
    // because the default value for texture pixels is zero.
    vec2 elevUv = computeUv(vUv, elevationOffsetScale.xy, elevationOffsetScale.zw);
    if (abs(texture2D(elevationTexture, elevUv).a) < 0.001) {
        discard;
    }
#endif

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

        if (hasTexture) {
            gl_FragColor.a = max(gl_FragColor.a, noTextureOpacity);
        } else {
            #if defined(COLORMAP)
                float data;
                if (colormapMode == 0) {
                    vec2 vVv = computeUv(vUv, elevationOffsetScale.xy, elevationOffsetScale.zw);
                    data = getElevation(elevationTexture, vVv);
                } else {
                    vec2 derivatives = computeDerivatives();
                    if (colormapMode == 1) {
                        data = calcSlope(derivatives);
                    } else {
                        data = calcAspect(derivatives);
                    }
                    data *= 180.0 / M_PI; // Convert radians to degrees
                }
                float normd = clamp((data - colormapMin) / (colormapMax - colormapMin), 0.0, 1.0);
                gl_FragColor = texture2D(vLut, vec2(normd, 0.0));
            #endif
            gl_FragColor = vec4(gl_FragColor.rgb, noTextureOpacity);
        }

#if defined(HILLSHADE)
        float hillshade = calcHillshade();
        gl_FragColor.rgb *= hillshade;
#endif

#if defined(DEBUG)
        if (showOutline && (vUv.x < sLine || vUv.x > 1.0 - sLine || vUv.y < sLine || vUv.y > 1.0 - sLine)) {
            gl_FragColor.rgb = mix(vec3(1.0, 0.0, 0.0), gl_FragColor.rgb, 0.2);
        }
#endif

    }

}
