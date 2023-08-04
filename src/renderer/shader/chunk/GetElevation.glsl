float getElevation(sampler2D tex, vec2 uv) {
    vec4 c = texture2D(tex, uv);
    return c.r;
}
