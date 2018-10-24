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


varying vec2        vUv;
varying vec3        vNormal;
varying vec4        pos;

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

void main() {
        vUv = uv;
        vec4 vPosition;

        if(loadedTexturesCount[0] > 0) {
            vec2    vVv = vec2(
                vUv.x * offsetScale_L00[0].z + offsetScale_L00[0].x,
                (1.0 - vUv.y) * offsetScale_L00[0].w + offsetScale_L00[0].y);

            float dv = getElevation(vVv);

            vPosition = vec4( position +  normal * dv ,1.0 );
        } else {
            vPosition = vec4( position ,1.0 );
        }

        vNormal = normalize ( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );

        gl_Position = projectionMatrix * modelViewMatrix * vPosition;
        #include <logdepthbuf_vertex>
}
