#include <giro3d_precision_qualifiers>
#include <giro3d_fragment_shader_header>
#include <giro3d_common>

varying vec2 vUv;

uniform Interpretation interpretation;
uniform sampler2D tex;
uniform sampler2D gridTexture;
uniform float opacity;
uniform bool flipY;
uniform NoDataOptions noDataOptions;
uniform bool showImageOutlines;

void main() {
    vec2 uv = flipY
        ? vec2(vUv.x, 1.0 - vUv.y)
        : vUv;

    vec4 raw = noDataOptions.enabled
        ? texture2DFillNodata(tex, uv, noDataOptions)
        : texture2D(tex, uv);

    gl_FragColor = decodeInterpretation(raw, interpretation);

    if (showImageOutlines) {
        vec4 grid = texture2D(gridTexture, uv);
        gl_FragColor = blend(grid, gl_FragColor);
    }

    gl_FragColor.a *= opacity;
}
