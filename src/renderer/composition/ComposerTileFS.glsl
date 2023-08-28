#include <giro3d_precision_qualifiers>
#include <giro3d_common>

varying vec2 vUv;

uniform Interpretation interpretation;
uniform sampler2D texture;
uniform sampler2D gridTexture;
uniform float opacity;
uniform bool flipY;
uniform bool fillNoData;
uniform bool showImageOutlines;

void main() {
    vec2 uv = flipY
        ? vec2(vUv.x, 1.0 - vUv.y)
        : vUv;

    vec4 raw = fillNoData
        ? texture2DFillNodata(texture, uv)
        : texture2D(texture, uv);

    gl_FragColor = decodeInterpretation(raw, interpretation);

    if (showImageOutlines) {
        vec4 grid = texture2D(gridTexture, uv);
        gl_FragColor = blend(grid, gl_FragColor);
    }

    gl_FragColor.a *= opacity;
}
