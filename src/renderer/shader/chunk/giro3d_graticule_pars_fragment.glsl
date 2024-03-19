#if defined(ENABLE_GRATICULE)
struct Graticule {
    float thickness; // 1 = default
    // xOffset, yOffset, xStep, yStep
    vec4 position;
    vec4  color; // Stores both the color and opacity
};

uniform Graticule graticule;

void drawGraticule(vec2 coordinate, Graticule graticule) {
    vec4 pos = graticule.position;
    float xOffset = pos[0];
    float yOffset = pos[1];
    float xStep = pos[2];
    float yStep = pos[3];

    if (xStep > 0. && yStep > 0.) {
        float xDist = mod(coordinate.x + xOffset, xStep);
        float yDist = mod(coordinate.y + yOffset, yStep);

        float halfThickness = graticule.thickness / 2.0;
        float dist = abs(min(xDist, yDist));

        if (dist <= halfThickness) {
            float opacity = graticule.color.a * smoothstep(0., 1., halfThickness - dist);
            vec4 finalColor = vec4(graticule.color.rgb, opacity);
            gl_FragColor = blend(finalColor, gl_FragColor);
        }
    }
}
#endif