#include <giro3d_precision_qualifiers>

// outputs
varying vec2 vUv;

void main() {
    vUv = uv;
    #include <begin_vertex>
    #include <project_vertex>
}