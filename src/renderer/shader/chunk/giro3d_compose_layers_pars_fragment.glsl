#if defined(ENABLE_LAYER_MASKS)
const int LAYER_MODE_NORMAL = 0;
const int LAYER_MODE_MASK = 1;
const int LAYER_MODE_MASK_INVERTED = 2;
#endif

#if COLOR_LAYERS
uniform sampler2D   colorTexture;         // Atlas texture shared among color layers
uniform LayerInfo   layers[COLOR_LAYERS]; // The color layers' infos
uniform ColorMap    layersColorMaps[COLOR_LAYERS]; // The color layers' color maps
#endif

vec4 blend(vec4 fore, vec4 back) {
    if (fore.a == 0. && back.a == 0.) {
        return vec4(0);
    }
    float alpha = fore.a + back.a * (1.0 - fore.a);
    vec3 color = (fore.rgb * fore.a) + back.rgb * (back.a * (1.0 - fore.a)) / alpha;

    return vec4(color, alpha);
}

vec4 computeColor(vec2 rawUv, vec4 offsetScale, sampler2D tex) {
    vec2 uv = computeUv(rawUv, offsetScale.xy, offsetScale.zw);
    return texture2D(tex, uv);
}

vec4 computeColorLayer(
    vec2 tileDimensions,
    sampler2D atlas,
    sampler2D lut,
    LayerInfo layer,
    ColorMap colorMap,
    vec2 uv
) {
    if (layer.offsetScale.zw != vec2(0.0)) {
        vec4 color;
        if (colorMap.mode != COLORMAP_MODE_DISABLED) {
            color = computeColorMap(tileDimensions, layer, atlas, colorMap, lut, uv);
        } else {
            color = computeColor(uv, layer.offsetScale, atlas);
        }
        vec3 rgb = color.rgb * layer.color.rgb;
        float a = color.a * layer.color.a;
        return vec4(rgb, a);
    }

    return vec4(0);
}