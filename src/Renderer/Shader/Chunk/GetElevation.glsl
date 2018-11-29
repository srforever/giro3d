float getElevation(sampler2D texture, vec2 uv) {
    #if defined(HEIGHTFIELD_ELEVATION)
        vec4 color = texture2D(texture, uv) * 255.0;
        return color.r;
    #elif defined(MAPBOX_RGB_ELEVATION)
        vec4 color = texture2D(texture, uv) * (255.0 * 0.1);
        return
            -10000.0 +
            color.r * 256.0 * 256.0 +
            color.g * 256.0 +
            color.b;
    #else
    return 0.0;
    #endif
}
