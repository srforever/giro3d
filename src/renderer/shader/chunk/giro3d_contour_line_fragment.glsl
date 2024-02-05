#if defined(ENABLE_CONTOUR_LINES)
    // Code inspired from https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/example/customMaterial.js
    // Note: we use the 'height' variable rather than wPosition.z because we want
    // this feature to work event when terrain deformation is disabled, and height
    // is always available.
    vec3 fdx = vec3( dFdx( wPosition.x ), dFdx( wPosition.y ), dFdx( height ) );
    vec3 fdy = vec3( dFdy( wPosition.x ), dFdy( wPosition.y ), dFdy( height ) );
    vec3 worldNormal = normalize( cross( fdx, fdy ) );

    // thickness scale
    float upwardness = dot( worldNormal, vec3( 0.0, 1.0, 0.0 ) );
    float yInv = clamp( 1.0 - abs( upwardness ), 0.0, 1.0 );
    float thicknessScale = pow( yInv, 0.4 );
    thicknessScale *= 0.25 + 0.5 * ( vViewPosition.z + 1.0 ) / 2.0;

    // thickness
    float thickness = 0.01 * thicknessScale;

    float finalThickness = thickness * contourLines.thickness * 0.15;

    float contourLineAlpha = contourLines.color.a * 1.0;

    drawContourLine(height, contourLines.primaryInterval, finalThickness, vec4(contourLines.color.rgb, contourLineAlpha));

    drawContourLine(height, contourLines.secondaryInterval, finalThickness, vec4(contourLines.color.rgb, contourLineAlpha *  0.4));
#endif