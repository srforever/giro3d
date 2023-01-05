#include <PrecisionQualifier>
#include <GetElevation>
#include <ComputeUV>
#include <LayerInfo>

attribute vec3      position;
attribute vec2      uv;

uniform sampler2D   elevationTexture;
uniform LayerInfo   elevationLayer;

#if defined(STITCHING)
struct Neighbour {
    vec4            offsetScale;
    float           diffLevel;
    sampler2D       elevationTexture;
};

uniform Neighbour   neighbours[8];
uniform float       segments;
uniform vec2        tileDimensions;
#endif

uniform mat4        projectionMatrix;
uniform mat4        modelViewMatrix;

// Outputs
varying vec2        vUv;

const float NO_NEIGHBOUR = -99.;
const int   INNER_VERTEX = -1;

const int TOP = 0;
const int TOP_RIGHT = 1;
const int RIGHT = 2;
const int BOTTOM_RIGHT = 3;
const int BOTTOM = 4;
const int BOTTOM_LEFT = 5;
const int LEFT = 6;
const int TOP_LEFT = 7;

vec2 clamp01(vec2 uv) {
    return vec2(
        clamp(uv.x, 0., 1.),
        clamp(uv.y, 0., 1.));
}

#if defined(STITCHING)
bool isEdge(int location) {
    return mod(float(location), 2.) == 0.;
}

float readNeighbourElevation(vec2 uv, int neighbour) {
    // We don't want UV outside the unit square
    vec2 vv = clamp01(uv);

    vec4 offsetScale = neighbours[neighbour].offsetScale;
    vec2 neighbourUv = computeUv(vv, offsetScale.xy, offsetScale.zw);

    // Why can't we simply do neighbours[neighbour].elevationTexture ?
    // It's because of a limitation of GLSL ES : texture arrays cannot be indexed dynamically.
    // They must be indexed by a constant expression (a literal or a constant).
    // See https://stackoverflow.com/a/60110986/2704779
    if (neighbour == TOP)
        return getElevation(neighbours[TOP].elevationTexture, neighbourUv);
    if (neighbour == TOP_RIGHT)
        return getElevation(neighbours[TOP_RIGHT].elevationTexture, neighbourUv);
    if (neighbour == RIGHT)
        return getElevation(neighbours[RIGHT].elevationTexture, neighbourUv);
    if (neighbour == BOTTOM_RIGHT)
        return getElevation(neighbours[BOTTOM_RIGHT].elevationTexture, neighbourUv);
    if (neighbour == BOTTOM)
        return getElevation(neighbours[BOTTOM].elevationTexture, neighbourUv);
    if (neighbour == BOTTOM_LEFT)
        return getElevation(neighbours[BOTTOM_LEFT].elevationTexture, neighbourUv);
    if (neighbour == LEFT)
        return getElevation(neighbours[LEFT].elevationTexture, neighbourUv);
    if (neighbour == TOP_LEFT)
        return getElevation(neighbours[TOP_LEFT].elevationTexture, neighbourUv);

}

// Returns the seam or corner that this UV belongs to.
// If this UV does not belong to a seam nor a corner, returns INNER_VERTEX
int locateVertex(vec2 uv) {
    const float ONE = 1.;
    const float ZERO = 0.;

    uv = clamp01(uv);

    float x = uv.x;
    float y = uv.y;

    if (y == ONE) {
        if (x == ZERO) {
            return TOP_LEFT;
        } else if (x == ONE) {
            return TOP_RIGHT;
        } else {
            return TOP;
        }
    } else if (y == ZERO) {
        if (x == ZERO) {
            return BOTTOM_LEFT;
        } else if (x == ONE) {
            return BOTTOM_RIGHT;
        } else {
            return BOTTOM;
        }
    } else if (x == ONE) {
        return RIGHT;
    } else if (x == ZERO) {
        return LEFT;
    } else {
        return INNER_VERTEX;
    }
}

/**
 * Computes the offsets of vertex position and UV coordinate to apply to this vertex
 * in order to fuse it with a neighbouring vertex.
 */
bool computeXYStitchingOffsets(
    // the UV of the vertex
    vec2 uv,
    // the location of the vertex (seam, corner, or inner)
    int location,
    // the resulting offset to apply to the vertex local space position
    out vec4 vertexOffset,
    // the resulting offset to apply to the vertex UV
    out vec2 uvOffset) {

    vec4 factor;
    float axis;

    const vec2 NO_UV_OFFSET = vec2(0, 0);
    const vec4 NO_POS_OFFSET = vec4(0, 0, 0, 0);

    if (location == RIGHT || location == LEFT) {
        factor = vec4(0, 1, 0, 0);
        axis = uv.y;
    } else if (location == TOP || location == BOTTOM) {
        factor = vec4(1, 0, 0, 0);
        axis = uv.x;
    } else {
        // we only move vertices that do belong to seams and nothing else.
        vertexOffset = NO_POS_OFFSET;
        uvOffset = NO_UV_OFFSET;
        return false;
    }

    float diffLevel = neighbours[location].diffLevel;
    if (diffLevel == NO_NEIGHBOUR) {
        vertexOffset = NO_POS_OFFSET;
        uvOffset = NO_UV_OFFSET;
        return false;
    }

    // XY-stitching only concerns tiles smaller than their neighbour.
    if (diffLevel < 0.) {
        float neighbourFactor = pow(2.0, abs(diffLevel));
        float modulo = neighbourFactor / segments;
        float offset = fract(axis / modulo) * modulo;
        uvOffset = offset * factor.xy;
        vertexOffset = offset * factor * vec4(tileDimensions, 0, 0);
        return true;
    } else {
        vertexOffset = NO_POS_OFFSET;
        uvOffset = NO_UV_OFFSET;
        return false;
    }
}

bool getNeighbour(int location) {
    float diffLevel = neighbours[location].diffLevel;

    return diffLevel != NO_NEIGHBOUR;
}

// Returns the locations of the three possible neighbours of this corner location.
// If a neighbour is not present, its value is -1.
// Returns true if at least one corner neighbour exists.
bool getCornerNeighbours(
    int location,
    out int n0,
    out int n1,
    out int n2
) {
    n0 = -1;
    n1 = -1;
    n2 = -1;

    bool result = false;

    float floc = float(location);

    // one of the neighbour is the location itself of course
    if (getNeighbour(location)) {
        n0 = location;
        result = true;
    }
    int next = int(mod(floc + 1., 8.));
    if (getNeighbour(next)) {
        n1 = next;
        result = true;
    }
    int prev = int(mod(floc - 1., 8.));
    if (getNeighbour(prev)) {
        n2 = prev;
        result = true;
    }

    return result;
}

float computeZStitchedElevation(vec2 uv, int location, float currentElevation) {
    // First case : the vertex is on an edge
    if (isEdge(location)) {
        float diffLevel = neighbours[location].diffLevel;

        // We don't have any neighbour at this location
        if (diffLevel == NO_NEIGHBOUR) {
            return currentElevation;
        }

        // If our neighbour has the same level (hence size), we average the two elevations
        // This neighbour will do the same in its own vertex shader with our elevation, and
        // the two vertices will have the same height.
        float neighbourElevation = readNeighbourElevation(uv, location);
        if (diffLevel == 0.) {
            return mix(currentElevation, neighbourElevation, 0.5);
        } else if (diffLevel < 0.) {
            // If our neighbour is bigger than us, we don't average. Instead, we take its elevation.
            // The reason for this behaviour is that it's not possible for the bigger neighbour to
            // average with our elevation, as the bigger neighbour can have more than one neighbour
            // for the same edge, making the computation really impractical.
            return neighbourElevation;
        }
    } else {
        // Corner case (pun intended). This case is more complicated as we can have up to 3 neighbours,
        // and the rule differ whether one neighbour is bigger than us.
        // If all the neighbours of this corner have the same depth, we average, otherwise we take the
        // elevation of the biggest neighbour.

        // First, we need to collect the theoretical neighbours, then eliminate the absent ones.
        int n0, n1, n2;
        // First, check that we have at least one corner neighbour.
        if (getCornerNeighbours(location, n0, n1, n2)) {
            // We do ! Now compute the weighted average.
            float sum = currentElevation;
            float weight = 1.;

            if (n0 != -1) {
                sum += readNeighbourElevation(uv, n0);
                weight += 1.;
            }
            if (n1 != -1) {
                sum += readNeighbourElevation(uv, n1);
                weight += 1.;
            }
            if (n2 != -1) {
                sum += readNeighbourElevation(uv, n2);
                weight += 1.;
            }

            return sum / weight;
        }
    }

    return currentElevation;
}

#endif

void main() {
    vUv = uv;
    vec4 pos = vec4(position, 1.0);

#if defined(ELEVATION_LAYER)
    if(elevationLayer.offsetScale.z > 0.) {
        vec2 vVv = computeUv(vUv, elevationLayer.offsetScale.xy, elevationLayer.offsetScale.zw);

        float elevation = getElevation(elevationTexture, vVv);

#if defined(STITCHING)
        /*
            Stitching aims to eliminate visible cracks between neighbouring tiles, that are caused
            by slight discrepancies in elevation and a different level of detail (LOD).

            This process contains 2 steps : XY-stitching and Z-stitching.

            XY-stitching
            ============

            XY-stitching works on the horizontal plane and is used to weld seams for neighbour tiles
            that have a different levels.

            The smallest tile (with the highest level) has a higher vertex density along the seam.
            Meaning that some vertices will not have an equivalent vertex in the neighbour, leading
            to visible cracks.

            In this figure, XY-stitching moves vertex A along the seam to the position of B.
            A and B have now exactly the same position in space, and the crack is removed.

            +------B------+------+      +------A+B----+------+
            |      |             |      |    / |             |
            |      |             |      | /    |             |
            +------A             +  =>  +      |             |
            |      |             |      |      |             |
            |      |             |      |      |             |
            +------+------+------+      +------+------+------+

            Note : XY-stitching only moves intermediate vertices of the seams, not corner vertices.

            Z-stitching
            ============

            Z-stitching is used to reconcile the variations in elevation (on the Z-axis) between the
            neighbouring seams, due to the fact that elevation pixels may have slightly different
            values on each side of the seam.
        */

        // Locate the vertex (is it on a seam, on a corner, or an inner vertex ?)
        int location = locateVertex(uv);

        // Don't perform stitching on vertices that are not on borders
        if (location != INNER_VERTEX) {
            vec4 vertexOffset;
            vec2 uvOffset;

            // Is there XY-stiching ?
            if (computeXYStitchingOffsets(
                    vUv,
                    location,
                    vertexOffset,
                    uvOffset)) {

                // move the UV and the vertex to perform XY-stitching
                vUv -= uvOffset;
                pos -= vertexOffset;

                // sanitize the UV to fight off potential rounding errors (we don't want the UV to
                // be outside the unit square)
                vUv = clamp01(vUv);

                // The vertex has moved, maybe now it location has changed (from seam to corner)
                location = locateVertex(vUv);
            }

            // Get the elevation of our vertex in our texture
            vec2 elevUv = computeUv(vUv, elevationLayer.offsetScale.xy, elevationLayer.offsetScale.zw);
            float currentElevation = getElevation(elevationTexture, elevUv);

            // Then apply Z-stitching
            elevation = computeZStitchedElevation(vUv, location, currentElevation);
        }
#endif

        pos.z = elevation;
    }
#endif

    gl_Position = projectionMatrix * modelViewMatrix * pos;
}
