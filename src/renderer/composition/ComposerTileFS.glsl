precision highp float;
precision highp int;

#include <FillNoData>
#include <Interpretation>

varying vec2 vUv;

uniform Interpretation interpretation;
uniform sampler2D texture;
uniform sampler2D gridTexture;
uniform float opacity;
uniform bool flipY;
uniform bool fillNoData;
uniform bool showImageOutlines;

vec4 blend(vec4 fore, vec4 back) {
    if (fore.a == 0. && back.a == 0.) {
        return vec4(0);
    }
    float alpha = fore.a + back.a * (1.0 - fore.a);
    vec3 color = (fore.rgb * fore.a) + back.rgb * (back.a * (1.0 - fore.a)) / alpha;

    return vec4(color, alpha);
}

void main() {
    vec2 uv = flipY
        ? vec2(vUv.x, 1.0 - vUv.y)
        : vUv;

    vec4 raw = fillNoData
        ? texture2DFillNodata(texture, uv)
        : texture2D(texture, uv);

    gl_FragColor = decode(raw, interpretation);

    if (showImageOutlines) {
        vec4 grid = texture2D(gridTexture, uv);
        gl_FragColor = blend(grid, gl_FragColor);
    }

    gl_FragColor.a *= opacity;
}
