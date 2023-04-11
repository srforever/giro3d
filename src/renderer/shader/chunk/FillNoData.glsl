float squaredDistance(vec2 a, vec2 b) {
    vec2 c = a - b;
    return dot(c, c);
}

/**
 * Returns the value of the valid pixel closest to uv.
 */
vec3 getNearestPixel(sampler2D texture, vec2 uv) {
    const int SAMPLES = 64;
    const float fSAMPLES = float(SAMPLES);

    vec3 result = vec3(0, 0, 0);
    float nearest = 9999.;

    // This brute force approach produces very good visual results, but is quite costly.
    // Collect all the samples, then use only the closest valid sample to the requested position.
    for(int x = 0; x < SAMPLES; ++x) {
        for(int y = 0; y < SAMPLES; ++y) {
            float u = float(x) / fSAMPLES;
            float v = float(y) / fSAMPLES;

            vec2 samplePosition = vec2(u, v);

            vec4 color = texture2D(texture, samplePosition);

            // Is it a valid sample ?
            if(color.a == 1.) {
                // We don't need the absolute distance, since we are only interested
                // in the closest point: we avoid a costly square root computation.
                float dist = squaredDistance(samplePosition, uv);

                if (dist < nearest) {
                    nearest = dist;
                    result = color.rgb;
                }
            }
        }
    }

    return result;
}

/*
 * Sample the texture, filling no-data (transparent) pixels with neighbouring
 * valid pixels.
 * Note: a pixel is considered no-data if its alpha channel is less than 1.
 * This way, if a bilinear interpolation touches a no-data pixel, it's also considered no-data.
 */
vec4 texture2DFillNodata(sampler2D texture, vec2 uv) {
    vec4 value = texture2D(texture, uv);
    if(value.a == 1.) {
        return value;
    }

    vec3 nearest = getNearestPixel(texture, uv);

    // Even though the color has been replaced by a neighbouring
    // pixel, the alpha channel must remain transparent !
    // This is is necessary to be able to hide those pixels in the fragment shaders.
    return vec4(nearest.rgb, 0.);
}
