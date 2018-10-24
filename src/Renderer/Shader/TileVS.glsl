#include <PrecisionQualifier>

attribute vec3      position;
attribute vec2      uv;

uniform sampler2D   elevationTexture;
uniform vec4        elevationOffsetScale;

uniform mat4        projectionMatrix;
uniform mat4        modelViewMatrix;

varying vec2        vUv;

#include <GetElevation>

void main() {
        vUv = uv;
        vec4 vPosition = vec4(position, 1.0);

        if(elevationOffsetScale.z > 0.) {
            vec2    vVv = vec2(
                vUv.x * elevationOffsetScale.z + elevationOffsetScale.x,
                (1.0 - vUv.y) * elevationOffsetScale.w + elevationOffsetScale.y);

            vPosition.z = getElevation(elevationTexture, vVv);
        }

        gl_Position = projectionMatrix * modelViewMatrix * vPosition;
}
