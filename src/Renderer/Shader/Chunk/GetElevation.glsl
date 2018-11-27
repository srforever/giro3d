float getElevation(sampler2D texture, vec2 uv) {
    #if defined(DATA_TEXTURE_ELEVATION)
        return max(texture2D(texture, uv).w, 0.);
    #elif defined(COLOR_TEXTURE_ELEVATION)
        vec4 color = texture2D(texture, uv);
        return color.r * 129.0;
    #else
    #error Must define either DATA_TEXTURE_ELEVATION or COLOR_TEXTURE_ELEVATION
    #endif
}
