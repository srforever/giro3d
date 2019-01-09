#if defined HEIGHTFIELD_ELEVATION
uniform float heightFieldOffset;
uniform float heightFieldScale;
#endif
#if defined(RATP_GEOL_ELEVATION)
const float lShift8 = 256.0;
const vec4 zShift = vec4(
  1.0,
  lShift8,
  lShift8 * lShift8,
  lShift8 * lShift8 * lShift8);
#endif

float getElevation(sampler2D texture, vec2 uv) {
    #if defined(HEIGHTFIELD_ELEVATION)
        vec4 c = texture2D(texture, uv);
        if (heightFieldOffset != 0.0) {
            c.r = (c.r - 1.0 / 255.0);
        }
        vec4 color = heightFieldOffset + c * heightFieldScale;
        return color.r;
    #elif defined(MAPBOX_RGB_ELEVATION)
        vec4 color = texture2D(texture, uv) * (255.0 * 0.1);
        return
            -10000.0 +
            color.r * 256.0 * 256.0 +
            color.g * 256.0 +
            color.b;
    #elif defined(RATP_GEOL_ELEVATION)
        vec4 val = texture2D(texture, uv);
        if (val.w > 0.0) {
            val /= (1.0 - max(1.0, val.w));
        }
        val *= zShift;
        return (val.x + val.y + val.z) - 2000.0;
    #else
    return 0.0;
    #endif
}
