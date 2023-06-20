precision highp float;
precision highp int;

#include <FillNoData>
#include <Interpretation>

varying vec2 vUv;

uniform Interpretation interpretation;
uniform sampler2D texture;
uniform float opacity;
uniform vec2 textureSize;
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

    gl_FragColor = decode(raw, interpretation);

    if (showImageOutlines) {
        const float outlineThickness = 2.0;
        vec2 uvPx = vec2(uv.x * textureSize.x, uv.y * textureSize.y);
        if (uvPx.x < outlineThickness || uvPx.x > (textureSize.x - outlineThickness)
        || uvPx.y < outlineThickness || uvPx.y > (textureSize.y - outlineThickness)) {
            gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
        }
    }

    gl_FragColor.a *= opacity;
}
