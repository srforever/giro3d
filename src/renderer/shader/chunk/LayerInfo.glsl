/**
 * Describe a color layer's attributes.
 */
struct LayerInfo {
    vec4        offsetScale; // The offset/scale tuple.
    vec4        color;       // Includes opacity/visible as alpha component
    vec2        textureSize; // The size, in pixels, of the atlas section mapping to this layer.
    int         mode;        // The layer mode (normal, mask)
    #if defined(ENABLE_ELEVATION_RANGE)
    vec2        elevationRange; // Optional elevation range for the layer. Any fragment above or below this range will be ignored.
    #endif
};
