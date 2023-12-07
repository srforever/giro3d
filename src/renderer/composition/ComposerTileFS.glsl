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
uniform int channelCount;
uniform int outputMode;

void main() {
    vec2 uv = flipY
        ? vec2(vUv.x, 1.0 - vUv.y)
        : vUv;

    int alphaChannelLocation = channelCount - 1;
    vec4 raw = noDataOptions.enabled
        ? texture2DFillNodata(tex, uv, noDataOptions, alphaChannelLocation)
        : texture2D(tex, uv);

    gl_FragColor = decodeInterpretation(raw, interpretation);

    if (outputMode == OUTPUT_MODE_COLOR) {
        gl_FragColor = toRGBA(gl_FragColor, channelCount);
    }

    if (showImageOutlines) {
        vec4 grid = texture2D(gridTexture, uv);
        gl_FragColor = blend(grid, gl_FragColor);
    }

    gl_FragColor.a *= opacity;
}
