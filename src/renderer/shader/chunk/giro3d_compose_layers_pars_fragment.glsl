#if defined(ENABLE_LAYER_MASKS)
const int LAYER_MODE_NORMAL = 0;
const int LAYER_MODE_MASK = 1;
const int LAYER_MODE_MASK_INVERTED = 2;
#endif

#if COLOR_LAYERS
uniform sampler2D   atlasTexture;         // Atlas texture shared among color layers
uniform LayerInfo   layers[COLOR_LAYERS]; // The color layers' infos
uniform ColorMap    layersColorMaps[COLOR_LAYERS]; // The color layers' color maps
#endif

vec4 computeColor(vec2 rawUv, vec4 offsetScale, sampler2D tex) {
    vec2 uv = computeUv(rawUv, offsetScale.xy, offsetScale.zw);
    return texture2D(tex, uv);
}

vec4 computeColorLayer(
    vec2 tileDimensions,
    sampler2D texture,
    sampler2D lut,
    LayerInfo layer,
    ColorMap colorMap,
    vec2 uv
) {
    if (layer.offsetScale.zw != vec2(0.0)) {
        vec4 color;
        if (colorMap.mode != COLORMAP_MODE_DISABLED) {
            color = computeColorMap(tileDimensions, layer, texture, colorMap, lut, uv);
        } else {
            color = computeColor(uv, layer.offsetScale, texture);
        }
        vec3 rgb = color.rgb * layer.color.rgb;

        float a = color.a * layer.color.a;
        return vec4(adjustBrightnessContrastSaturation(rgb, layer.brightnessContrastSaturation), a);
    }

    return vec4(0);
}