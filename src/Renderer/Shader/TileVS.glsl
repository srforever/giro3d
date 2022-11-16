#include <PrecisionQualifier>

attribute vec3      position;
attribute vec2      uv;

uniform sampler2D   elevationTexture;
uniform vec4        elevationOffsetScale;
#if defined(STITCHING)
uniform sampler2D nTex[4];
uniform vec4 nOff[4];
uniform vec2 geometryDim;
#endif

uniform mat4        projectionMatrix;
uniform mat4        modelMatrix;
uniform mat4        viewMatrix;
uniform mat4 modelViewMatrix;

uniform vec4 neighbourdiffLevel;
uniform vec2 tileDimensions;

varying vec2        vUv;
varying vec4 vColor;
varying vec4 vPosition;

#include <GetElevation>
#include <ComputeUV>

#if defined(STITCHING)
float readNeighbourElevation(vec2 uv, int neighbour, sampler2D texture) {
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
    return getElevation(texture, vVv);
}
#endif

void main() {
    vUv = uv;
    vPosition = vec4(position, 1.0);
    vColor = vec4(0., 0., 0., 0.);

    if(elevationOffsetScale.z > 0.) {
        vec2 vVv = computeUv(vUv, elevationOffsetScale.xy, elevationOffsetScale.zw);
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
        // going to be: neighbourFactor / geometryDim;
        // West border
        if (vUv.x == 0.0) {
            if (neighbourdiffLevel.w < 0.0) {
                float modulo = neighbourFactor.w / geometryDim.y;
                float offset = fract(vUv.y / modulo) * modulo;
                vPosition.y -= tileDimensions.y * offset;
                vUv.y -= offset;

                elevation = readNeighbourElevation(vUv, 3, nTex[3]);
                weight = 1;
                // vColor = vec4(0.0, 1.0, 0.0, 0.5);
            } else if (neighbourdiffLevel.w == 0.0) {
                elevation += readNeighbourElevation(uv, 3, nTex[3]);
                weight += 1;
            }
        }
        // East border
        else if (vUv.x == 1.0) {
            if (neighbourdiffLevel.y < 0.0) {
                float modulo = neighbourFactor.y / geometryDim.y;
                float offset = fract(vUv.y / modulo) * modulo;
                vPosition.y -= tileDimensions.y * offset;
                vUv.y -= offset;
                elevation = readNeighbourElevation(vUv, 1, nTex[1]);
                weight = 1;
                // vColor = vec4(1.0, 1.0, 0.0, 0.5);
            } else if (neighbourdiffLevel.y == 0.0) {
                elevation += readNeighbourElevation(uv, 1, nTex[1]);
                weight += 1;
            }
        }
        // South border
        if (vUv.y == 0.0) {
            if (neighbourdiffLevel.z < 0.0) {
                float modulo = neighbourFactor.z / geometryDim.x;
                float offset = fract(vUv.x / modulo) * modulo;
                vUv.x -= offset;
                if (uv.x == 0.0 || uv.x == 1.0) {
                    elevation += readNeighbourElevation(vUv, 2, nTex[2]);
                    weight += 1;
                } else {
                    vPosition.x -= tileDimensions.x * offset;
                    elevation = readNeighbourElevation(vUv, 2, nTex[2]);
                    weight = 1;
                }
                // vColor = vec4(0.0, 1.0, 1.0, 0.5);
            } else if (neighbourdiffLevel.z == 0.0) {
                elevation += readNeighbourElevation(uv, 2, nTex[2]);
                weight += 1;
            }
        }
        // North border
        else if (vUv.y == 1.0) {
            if (neighbourdiffLevel.x < 0.0) {
                float modulo = neighbourFactor.x / geometryDim.x;
                float offset = fract(vUv.x / modulo) * modulo;
                vUv.x -= offset;
                if (uv.x == 0.0 || uv.x == 1.0) {
                    elevation += readNeighbourElevation(vUv, 0, nTex[0]);
                    weight += 1;
                } else {
                    vPosition.x -= tileDimensions.x * offset;
                    elevation = readNeighbourElevation(vUv, 0, nTex[0]);
                    weight = 1;
                }
                // vColor = vec4(0.0, 0.0, 1.0, 0.5);
            } else if (neighbourdiffLevel.x == 0.0) {
                elevation += readNeighbourElevation(uv, 0, nTex[0]);
                weight += 1;
            }
        }

        if (weight > 1) {
            elevation /= float(weight);
        }
#endif
        vPosition.z = elevation;
    }

    // colors from OGC EL.GridCoverage.Default style
    // float z = vPosition.z;
    // if (z < -100.0) {
    //     vColor = vec4(float(0x00) / 255.0, float(0x5C) / 255.0, float(0xE6) / 255.0, 1.0);
    // } else if (z <= 0.0) {
    //     vColor = mix(
    //         vec4(float(0x00) / 255.0, float(0x5C) / 255.0, float(0xE6) / 255.0, 1.0),
    //         vec4(float(0x28) / 255.0, float(0xED) / 255.0, float(0xD6) / 255.0, 1.0),
    //         -z / 100.0);
    // } else if (z <= 50.0) {
    //     vColor = mix(
    //         vec4(float(0x00) / 255.0, float(0x5C) / 255.0, float(0xE6) / 255.0, 1.0),
    //         vec4(float(0x28) / 255.0, float(0xED) / 255.0, float(0xD6) / 255.0, 1.0),
    //         -z / 100.0);
    // } else if (z <= 50.0) {
    //     vColor = mix(
    //         vec4(float(0x28) / 255.0, float(0xED) / 255.0, float(0xD6) / 255.0, 1.0),
    //         vec4(float(0x54) / 255.0, float(0xF7) / 255.0, float(0x6D) / 255.0, 1.0),
    //         z / 50.0);
    // } else if (z <= 100.0) {
    //     vColor = mix(
    //         vec4(float(0x54) / 255.0, float(0xF7) / 255.0, float(0x6D) / 255.0, 1.0),
    //         vec4(float(0x9A) / 255.0, float(0xFA) / 255.0, float(0x66) / 255.0, 1.0),
    //         (z - 50.0)/ 50.0);
    // } else {
    //     vColor = mix(
    //         vec4(float(0x9A) / 255.0, float(0xFA) / 255.0, float(0x66) / 255.0, 1.0),
    //         vec4(float(0x7B) / 255.0, float(0xF2) / 255.0, float(0x3A) / 255.0, 1.0),
    //         (z - 100.0)/ 50.0);
    // }
    gl_Position = projectionMatrix * modelViewMatrix * vPosition;
}
