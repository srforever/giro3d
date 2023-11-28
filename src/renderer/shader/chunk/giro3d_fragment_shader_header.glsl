layout(location = 0) out highp vec4 pc_fragColor;
// GLSL version 3 does not define the built-in gl_FragColor, so we alias it
#define gl_FragColor pc_fragColor