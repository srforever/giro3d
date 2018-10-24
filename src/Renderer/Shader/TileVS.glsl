#include <PrecisionQualifier>

attribute vec3      position;
attribute vec2      uv;

uniform sampler2D   elevationTexture;
uniform vec4        elevationOffsetScale;
#if defined(STITCHING)
uniform sampler2D nTex[4];
uniform vec4 nOff[4];
#endif

uniform mat4        projectionMatrix;
uniform mat4        modelViewMatrix;

uniform vec4 neighbourdiffLevel;
uniform vec2 tileDimensions;

varying vec2        vUv;
varying vec4 vColor;


#include <GetElevation>

#if defined(STITCHING)
vec2 computeUv(vec2 uv, vec2 offset, vec2 scale) {
    return vec2(
        uv.x * scale.x + offset.x,
        (1.0 - uv.y) * scale.y + offset.y);
}
float readNeighbourElevation(vec2 uv, int neighbour) {
    vec2 vv = uv;
    // top
    if (neighbour == 1 || neighbour == 3) {
        vv.x = 1.0 - vv.x;
    } else {
        vv.y = 1.0 - vv.y;
    }
    vec2 vVv = computeUv(
        vv,
        nOff[neighbour].xy, nOff[neighbour].zw);
    return getElevation(nTex[neighbour], vVv);
}
#endif


void main() {
    vUv = uv;
    vec4 vPosition = vec4(position, 1.0);
    vColor = vec4(0., 0., 0., 0.);

    if(elevationOffsetScale.z > 0.) {
        vec2    vVv = vec2(
            vUv.x * elevationOffsetScale.z + elevationOffsetScale.x,
            (1.0 - vUv.y) * elevationOffsetScale.w + elevationOffsetScale.y);

        int weight = 1;

        float elevation = getElevation(elevationTexture, vVv);

#if defined(STITCHING)
        if (vUv.x < 0.01) {
            if (neighbourdiffLevel.w < 0.0) {
                if (fract((vUv.y / 0.0625) / 2.0) > 0.1) {
                    vPosition.y -= tileDimensions.y / 16.0;
                    vUv.y -= 0.0625;
                }
                elevation = readNeighbourElevation(vUv, 3);
                // vColor = vec4(1.0, 0.0, 0.0, 0.5);
            } else if (neighbourdiffLevel.w == 0.0) {
                elevation += readNeighbourElevation(uv, 3);
                weight += 1;
            }
        } else if (vUv.x > 0.99) {
            if (neighbourdiffLevel.y < 0.0) {
                if (fract((vUv.y / 0.0625) / 2.0) > 0.1) {
                    // move up
                    vPosition.y -= tileDimensions.y / 16.0;
                    vUv.y -= 0.0625;
                }
                elevation = readNeighbourElevation(vUv, 1);
                // vColor = vec4(1.0, 1.0, 0.0, 0.5);
            } else if (neighbourdiffLevel.y == 0.0) {
                elevation += readNeighbourElevation(uv, 1);
                weight += 1;
            }
        }

        if (vUv.y < 0.01) {
            if (neighbourdiffLevel.z < 0.0) {
                if (fract((vUv.x / 0.0625) / 2.0) > 0.1) {
                    // move to the left
                    vPosition.x -= tileDimensions.x / 16.0;
                    vUv.x -= 0.0625;
                }

                elevation = readNeighbourElevation(vUv, 2);
                weight = 1;
            } else if (neighbourdiffLevel.z == 0.0) {
                elevation += readNeighbourElevation(uv, 2);
                weight += 1;
            }
        } else if (vUv.y > 0.99) {
            if (neighbourdiffLevel.x < 0.0) {
                if (fract((vUv.x / 0.0625) / 2.0) > 0.1) {
                    vPosition.x -= tileDimensions.x / 16.0;
                    vUv.x -= 0.0625;
                }

                elevation = readNeighbourElevation(vUv, 0);
                weight = 1;
            } else if (neighbourdiffLevel.x == 0.0) {
                elevation += readNeighbourElevation(uv, 0);
                weight += 1;
            }
        }

        if (weight > 1) {
            elevation /= float(weight);
        }
#endif
        vPosition.z = elevation;
    }

    gl_Position = projectionMatrix * modelViewMatrix * vPosition;
}
