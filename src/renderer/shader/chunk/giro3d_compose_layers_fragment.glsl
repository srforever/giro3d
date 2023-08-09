#if COLOR_LAYERS
    float maskOpacity = 1.;

    #pragma unroll_loop_start
    for (int i = 0; i < COLOR_LAYERS; i++) {
        LayerInfo layer = layers[i];
        if (layer.color.a > 0.) {
            ColorMap colorMap = layersColorMaps[i];
            vec4 rgba = computeColorLayer(tileDimensions, colorTexture, colorMapAtlas, layer, colorMap, vUv);
            vec4 blended;

        // Let's blend the layer color to the composited color.
        #if defined(ENABLE_LAYER_MASKS)
            if (layer.mode == LAYER_MODE_MASK) {
                // Mask layers do not contribute to the composition color.
                // instead, they contribute to the overall opacity of the map.
                maskOpacity *= rgba.a;
                blended = gl_FragColor;
            } else if (layer.mode == LAYER_MODE_MASK_INVERTED) {
                maskOpacity *= (1. - rgba.a);
                blended = gl_FragColor;
            } else if (layer.mode == LAYER_MODE_NORMAL) {
                // Regular alpha blending
                blended = blend(rgba, gl_FragColor);
            }
        #else
            // Regular alpha blending
            blended = blend(rgba, gl_FragColor);
        #endif

#if defined(ENABLE_ELEVATION_RANGE)
            vec2 range = layer.elevationRange;
            if (clamp(height, range.x, range.y) == height) {
                gl_FragColor = blended;
            }
#else
            gl_FragColor = blended;
#endif
        }
    }
    #pragma unroll_loop_end

    gl_FragColor.a *= maskOpacity;
#endif