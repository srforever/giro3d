#if defined(ENABLE_CONTOUR_LINES)
struct ContourLine {
    float thickness; // 1 = default
    float primaryInterval; // A zero interval disables the line
    float secondaryInterval; // A zero interval disables the line
    vec4  color; // Stores both the color and opacity
};

uniform ContourLine contourLines; // 1 = default
#endif

void drawContourLine(float height, float interval, float thickness, vec4 color) {
    if (interval > 0.) {
        float dist = mod(height, interval);

        if (dist <= thickness) {
            gl_FragColor = blend(color, gl_FragColor);
        }
    }
}