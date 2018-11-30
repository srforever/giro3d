vec2 computeUv(vec2 uv, vec2 offset, vec2 scale) {
    return vec2(
        uv.x * scale.x + offset.x,
        1.0 - (offset.y + (1.0 - uv.y) * scale.y));
}
