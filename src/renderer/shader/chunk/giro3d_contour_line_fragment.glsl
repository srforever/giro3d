#if defined(ENABLE_CONTOUR_LINES)
    float contourLineParam = mod(height, contourLineInterval) / contourLineInterval;
    float contourLineAlpha = texture2D(contourLineTexture, vec2(0.5, contourLineParam)).a;
    gl_FragColor = blend(vec4(contourLineColor.rgb, contourLineColor.a * contourLineAlpha), gl_FragColor);
#endif