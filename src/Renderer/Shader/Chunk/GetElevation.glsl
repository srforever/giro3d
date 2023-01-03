float getElevation(sampler2D texture, vec2 uv) {
    vec4 c = texture2D(texture, uv);
    return c.r;
}
