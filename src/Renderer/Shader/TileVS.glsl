#include <PrecisionQualifier>

attribute vec3      position;
attribute vec2      uv;

uniform sampler2D   elevationTexture;
uniform vec4        elevationOffsetScale;
#if defined(STITCHING)
uniform sampler2D nTex[4];
uniform vec4 nOff[4];
uniform float segments;
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
        // We process the 4 borders separatly. The logic is:
        // - identify if the current vertex is on the border
        // - then, if the neighbour tile is:
        //     - at the same level (= precision): we average
        //       both elevations
        //     - at a lower level (less precise): we use its
        //       elevation. And if this vertex has no direct
        //       v-neighbour, it is shifted along the other
        //       (x when processing north/south border, else
        //       y) to be at the same position than the vertex
        //       on the other tile. Eg, for vertex 'o' below:
        //
        //    ---xx--x--       ---xx--x--
        //       ||  |            ||⋱|
        //       |o--x--  =>      ||  x--
        //       ||  |            ||  |
        //    ---xx--x--       ---xx--x--
        //       ||  |            ||  |
        //
        // factor: num_vert_in_tile / num_vert_in_neighbour_tile
        //       = 2^(level_difference)
        vec4 neighbourFactor = pow(vec4(2.0), abs(neighbourdiffLevel));
        // Interval in current tile is: 1.0 / segments. If a neighbour
        // has less vertices on our shared edges, its interval size is
        // going to be:
        vec4 modulo = neighbourFactor / segments;
        // West border
        if (vUv.x < 0.01) {
            if (neighbourdiffLevel.w < 0.0) {
                float offset = fract(vUv.y / modulo.w) * modulo.w;
                vPosition.y -= tileDimensions.y * offset;
                vUv.y -= offset;

                elevation = readNeighbourElevation(vUv, 3);
                // vColor = vec4(1.0, 0.0, 0.0, 0.5);
            } else if (neighbourdiffLevel.w == 0.0) {
                elevation += readNeighbourElevation(uv, 3);
                weight += 1;
            }
        }
        // East border
        else if (vUv.x > 0.99) {
            if (neighbourdiffLevel.y < 0.0) {
                float offset = fract(vUv.y / modulo.y) * modulo.y;
                vPosition.y -= tileDimensions.y * offset;
                vUv.y -= offset;
                elevation = readNeighbourElevation(vUv, 1);
                // vColor = vec4(1.0, 1.0, 0.0, 0.5);
            } else if (neighbourdiffLevel.y == 0.0) {
                elevation += readNeighbourElevation(uv, 1);
                weight += 1;
            }
        }
        // South border
        if (vUv.y < 0.01) {
            if (neighbourdiffLevel.z < 0.0) {
                float offset = fract(vUv.x / modulo.z) * modulo.z;
                // move to the left
                vPosition.x -= tileDimensions.x * offset;
                vUv.x -= offset;

                elevation = readNeighbourElevation(vUv, 2);
                weight = 1;
            } else if (neighbourdiffLevel.z == 0.0) {
                elevation += readNeighbourElevation(uv, 2);
                weight += 1;
            }
        }
        // North border
        else if (vUv.y > 0.99) {
            if (neighbourdiffLevel.x < 0.0) {
                float offset = fract(vUv.x / modulo.x) * modulo.x;
                vPosition.x -= tileDimensions.x * offset;
                vUv.x -= offset;

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
