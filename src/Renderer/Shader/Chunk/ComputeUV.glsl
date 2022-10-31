vec2 computeUv(vec2 uv, vec2 offset, vec2 scale) {
    return vec2(
        uv.x * scale.x + offset.x,
        uv.y * scale.y + offset.y);
}
