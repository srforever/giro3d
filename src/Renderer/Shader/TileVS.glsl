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

varying vec2 vUv;
varying vec4 vColor;
varying vec4 vPosition;

#include <GetElevation>
#include <ComputeUV>

const int NORTH = 0;
const int EAST = 1;
const int SOUTH = 2;
const int WEST = 3;

float round(float x) {
    return floor(x + 0.5);
}

#if defined(STITCHING)
float readNeighbourElevation(vec2 uv, int neighbour) {
    // We don't want UV outside the unit square
    vec2 vv = vec2(
        clamp(uv.x, 0., 1.),
        clamp(uv.y, 0., 1.));

    vec4 offsetScale = nOff[neighbour];
    vec2 vVv = computeUv(vv, offsetScale.xy, offsetScale.zw);

    return getElevation(nTex[neighbour], vVv);
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

                elevation = readNeighbourElevation(vUv, WEST);
                weight = 1;
                // vColor = vec4(0.0, 1.0, 0.0, 0.5);
            } else if (neighbourdiffLevel.w == 0.0) {
                elevation += readNeighbourElevation(uv, WEST);
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

                elevation = readNeighbourElevation(vUv, EAST);
                weight = 1;
                // vColor = vec4(1.0, 1.0, 0.0, 0.5);
            } else if (neighbourdiffLevel.y == 0.0) {
                elevation += readNeighbourElevation(uv, EAST);
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
                    elevation += readNeighbourElevation(vUv, SOUTH);
                    weight += 1;
                } else {
                    vPosition.x -= tileDimensions.x * offset;
                    elevation = readNeighbourElevation(vUv, SOUTH);
                    weight = 1;
                }
                // vColor = vec4(0.0, 1.0, 1.0, 0.5);
            } else if (neighbourdiffLevel.z == 0.0) {
                elevation += readNeighbourElevation(uv, SOUTH);
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
                    elevation += readNeighbourElevation(vUv, NORTH);
                    weight += 1;
                } else {
                    vPosition.x -= tileDimensions.x * offset;
                    elevation = readNeighbourElevation(vUv, NORTH);
                    weight = 1;
                }
                // vColor = vec4(0.0, 0.0, 1.0, 0.5);
            } else if (neighbourdiffLevel.x == 0.0) {
                elevation += readNeighbourElevation(uv, NORTH);
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
