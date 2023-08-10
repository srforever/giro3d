#if defined(ENABLE_CONTOUR_LINES)
    // Code inspired from https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/example/customMaterial.js
    vec3 fdx = vec3( dFdx( wPosition.x ), dFdx( wPosition.y ), dFdx( wPosition.z ) );
    vec3 fdy = vec3( dFdy( wPosition.x ), dFdy( wPosition.y ), dFdy( wPosition.z ) );
    vec3 worldNormal = normalize( cross( fdx, fdy ) );

    // thickness scale
    float upwardness = dot( worldNormal, vec3( 0.0, 1.0, 0.0 ) );
    float yInv = clamp( 1.0 - abs( upwardness ), 0.0, 1.0 );
    float thicknessScale = pow( yInv, 0.4 );
    thicknessScale *= 0.25 + 0.5 * ( vViewPosition.z + 1.0 ) / 2.0;

    // thickness
    float thickness = 0.01 * thicknessScale;
    float thickness2 = thickness / 2.0;

    if (contourLineInterval > 0.) {
        float m = mod(wPosition.z, contourLineInterval);
        float dist = clamp( abs( m - thickness2 ), 0.0, 1.0 );

        vec4 contourLine1 = mix(contourLineColor, vec4(0), dist);
        gl_FragColor = blend(vec4(contourLine1.rgb, contourLine1.a), gl_FragColor);
    }

    if (secondaryContourLineInterval > 0.) {
        float m = mod(wPosition.z, secondaryContourLineInterval);
        float dist = clamp( abs( m - thickness2 ), 0.0, 1.0 );

        vec4 contourLine2 = mix(contourLineColor, vec4(0), dist);
        gl_FragColor = blend(vec4(contourLine2.rgb, contourLine2.a * 0.4), gl_FragColor);
    }
#endif