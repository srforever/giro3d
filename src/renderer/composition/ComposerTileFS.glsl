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
uniform bool expandRGB;

void main() {
    vec2 uv = flipY
        ? vec2(vUv.x, 1.0 - vUv.y)
        : vUv;

    if (noDataOptions.enabled) {
        int alphaChannelLocation = channelCount - 1;
        gl_FragColor = texture2DFillNodata(tex, uv, noDataOptions, alphaChannelLocation);
    } else {
        gl_FragColor = texture2D(tex, uv);

        gl_FragColor = decodeInterpretation(gl_FragColor, interpretation);

        if (expandRGB) {
            gl_FragColor = grayscaleToRGB(gl_FragColor, interpretation);
        }
    }

    if (showImageOutlines) {
        vec4 grid = texture2D(gridTexture, uv);
        gl_FragColor = blend(grid, gl_FragColor);
    }

    gl_FragColor.a *= opacity;

    #include <colorspace_fragment>
}
