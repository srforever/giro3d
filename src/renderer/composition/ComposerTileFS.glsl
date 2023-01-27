precision highp float;
precision highp int;

#include <Interpretation>

uniform Interpretation interpretation;

// inputs
uniform sampler2D texture;
varying vec2 vUv;

#if defined(OUTLINES)
uniform vec2 textureSize;
#endif

void main() {
#if defined(FLIP_Y)
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
#else
    vec2 uv = vUv;
#endif

    gl_FragColor = decode(texture, uv, interpretation);

    #if defined(OUTLINES)
    const float outlineThickness = 2.0;
    vec2 uvPx = vec2(uv.x * textureSize.x, uv.y * textureSize.y);
    if (uvPx.x < outlineThickness || uvPx.x > (textureSize.x - outlineThickness)
     || uvPx.y < outlineThickness || uvPx.y > (textureSize.y - outlineThickness)) {
        gl_FragColor.rgb = vec3(1.0, 1.0, 0.0);
    }
    #endif
}
