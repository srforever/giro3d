#include <giro3d_precision_qualifiers>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

#define EPSILON 1e-6

uniform float size;

uniform int pickingId;
uniform int mode;
uniform float opacity;
uniform vec4 overlayColor;
attribute vec3 color;
attribute vec4 unique_id;
attribute float intensity;

#if defined(NORMAL_OCT16)
attribute vec2 oct16Normal;
#elif defined(NORMAL_SPHEREMAPPED)
attribute vec2 sphereMappedNormal;
#endif

uniform sampler2D overlayTexture;
uniform float hasOverlayTexture;
uniform vec4 offsetScale;
uniform vec2 extentBottomLeft;
uniform vec2 extentSize;

varying vec4 vColor;

// see https://web.archive.org/web/20150303053317/http://lgdv.cs.fau.de/get/1602
// and implementation in PotreeConverter (BINPointReader.cpp) and potree (BinaryDecoderWorker.js)
#if defined(NORMAL_OCT16)
vec3 decodeOct16Normal(vec2 encodedNormal) {
    vec2 nNorm = 2. * (encodedNormal / 255.) - 1.;
    vec3 n;
    n.z = 1. - abs(nNorm.x) - abs(nNorm.y);
    if (n.z >= 0.) {
        n.x = nNorm.x;
        n.y = nNorm.y;
    } else {
        n.x = sign(nNorm.x) - sign(nNorm.x) * sign(nNorm.y) * nNorm.y;
        n.y = sign(nNorm.y) - sign(nNorm.y) * sign(nNorm.x) * nNorm.x;
    }
    return normalize(n);
}
#elif defined(NORMAL_SPHEREMAPPED)
// see http://aras-p.info/texts/CompactNormalStorage.html method #4
// or see potree's implementation in BINPointReader.cpp
vec3 decodeSphereMappedNormal(vec2 encodedNormal) {
    vec2 fenc = 2. * encodedNormal / 255. - 1.;
    float f = dot(fenc,fenc);
    float g = 2. * sqrt(1. - f);
    vec3 n;
    n.xy = fenc * g;
    n.z = 1. - 2. * f;
    return n;
}
#endif

#ifdef DEFORMATION_SUPPORT
uniform int enableTransfo;
uniform mat4 transformations[NUM_TRANSFO];
uniform vec3 vec[NUM_TRANSFO];
uniform vec2 origin[NUM_TRANSFO];
uniform vec2 influence[NUM_TRANSFO];
uniform vec4 tColors[NUM_TRANSFO];
#endif

void main() {

#if defined(NORMAL_OCT16)
    vec3  normal = decodeOct16Normal(oct16Normal);
#elif defined(NORMAL_SPHEREMAPPED)
    vec3 normal = decodeSphereMappedNormal(sphereMappedNormal);
#elif defined(NORMAL)
    // nothing to do
#else
    // default to color
    vec3 normal = color;
#endif

    if (pickingId > 0) {
        vColor = unique_id;

        int left4bitsShift = 16; // << 4 <=> * 2^4
        int left8bitsShift = left4bitsShift * left4bitsShift;
        // 20 bits for 'unique_id' (= the point index in the buffer)
        // 12 bits for 'pickingId' (= the point instance id)
        // (see Picking.js)
        //     = |4bits||     8 bits     |
        //          ^ left-most 4 bits of the green channel
        //                     ^ red channel
        int upperPart = pickingId / left8bitsShift;
        int lowerPart = pickingId - upperPart * left8bitsShift; // 8 bits
        vColor.r = float(lowerPart) / 255.0;
        vColor.g += float(upperPart * 8) / 255.0; // << 4
        // vColor.g += float(upperPart * left4bitsShift) / 255.0;
    } else if (mode == MODE_INTENSITY) {
        vColor = vec4(intensity, intensity, intensity, opacity);
    } else if (mode == MODE_NORMAL) {
        vColor = vec4(abs(normal), opacity);
    } else if (mode == MODE_TEXTURE) {
        vec2 pp = (modelMatrix * vec4(position, 1.0)).xy;
        // offsetScale is from bottomleft
        pp.x -= extentBottomLeft.x;
        pp.y -= extentBottomLeft.y;
        pp *= offsetScale.zw / extentSize;
        pp += offsetScale.xy;
        vec3 textureColor = texture2D(overlayTexture, pp).rgb;
        vColor = vec4(mix(textureColor, overlayColor.rgb, overlayColor.a), opacity * hasOverlayTexture);
    } else if (mode == MODE_ELEVATION) {
        float z = (modelMatrix * vec4(position, 1.0)).z;
        // colors from OGC EL.GridCoverage.Default style
        if (z < -100.0) {
            vColor = vec4(float(0x00) / 255.0, float(0x5C) / 255.0, float(0xE6) / 255.0, 1.0);
        } else if (z <= 0.0) {
            vColor = mix(
                vec4(float(0x00) / 255.0, float(0x5C) / 255.0, float(0xE6) / 255.0, 1.0),
                vec4(float(0x28) / 255.0, float(0xED) / 255.0, float(0xD6) / 255.0, 1.0),
                -z / 100.0);
        } else if (z <= 50.0) {
            vColor = mix(
                vec4(float(0x00) / 255.0, float(0x5C) / 255.0, float(0xE6) / 255.0, 1.0),
                vec4(float(0x28) / 255.0, float(0xED) / 255.0, float(0xD6) / 255.0, 1.0),
                -z / 100.0);
        } else if (z <= 50.0) {
            vColor = mix(
                vec4(float(0x28) / 255.0, float(0xED) / 255.0, float(0xD6) / 255.0, 1.0),
                vec4(float(0x54) / 255.0, float(0xF7) / 255.0, float(0x6D) / 255.0, 1.0),
                z / 50.0);
        } else if (z <= 100.0) {
            vColor = mix(
                vec4(float(0x54) / 255.0, float(0xF7) / 255.0, float(0x6D) / 255.0, 1.0),
                vec4(float(0x9A) / 255.0, float(0xFA) / 255.0, float(0x66) / 255.0, 1.0),
                (z - 50.0)/ 50.0);
        } else {
            vColor = mix(
                vec4(float(0x9A) / 255.0, float(0xFA) / 255.0, float(0x66) / 255.0, 1.0),
                vec4(float(0x7B) / 255.0, float(0xF2) / 255.0, float(0x3A) / 255.0, 1.0),
                (z - 100.0)/ 50.0);
        }
        vColor.a = opacity;
    } else {
        // default to color mode
        vColor = vec4(mix(color, overlayColor.rgb, overlayColor.a), opacity);
    }

    mat4 mvMatrix = modelViewMatrix;

    #ifdef DEFORMATION_SUPPORT
    if (!pickingMode) {
        vColor = enableTransfo > 0 ?
            vec4(0.0, 1.0, 1.0, 1.0):
            vec4(1.0, 0.0, 1.0, 1.0);
    }
    if (enableTransfo > 0) {
        vec4 mPosition = modelMatrix * vec4(position, 1.0);
        float minDistance = 1000.0;
        int bestChoice = -1;
        for (int i = 0; i < NUM_TRANSFO; i++) {
            if (i >= enableTransfo) {
                break;
            }
            vec2 v = vec[i].xy;
            float length = vec[i].z;
            float depassement_x =
                length * (influence[i].x - 1.0);

            vec2 diff = mPosition.xy - origin[i];
            float distance_x = dot(diff, v);

            if (-depassement_x <= distance_x &&
                    distance_x <= (length + depassement_x)) {
                vec2 normal = vec2(-v.y, v.x);
                float d = abs(dot(diff, normal));
                if (d < minDistance && d <= influence[i].y) {
                    minDistance = d;
                    bestChoice = i;
                }
            }
        }

        if (bestChoice >= 0) {
            // override modelViewMatrix
            mvMatrix = transformations[bestChoice];
            vColor = mix(
                tColors[bestChoice],
                vec4(color, 1.0),
                0.5);
        }
    }
    #endif

    #include <begin_vertex>
    #include <project_vertex>

    if (size > 0.) {
        gl_PointSize = size;
    } else {
        gl_PointSize = clamp(-size / gl_Position.w, 3.0, 10.0);
    }

    #include <logdepthbuf_vertex>
    #include <clipping_planes_vertex>
}
