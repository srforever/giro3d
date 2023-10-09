#include <giro3d_common>
#include <giro3d_precision_qualifiers>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

varying vec4 vColor;
uniform int mode;
uniform vec3 brightnessContrastSaturation;

void main() {
    #include <clipping_planes_fragment>

    if (mode == MODE_TEXTURE && vColor.a < 0.001) {
        discard;
    }

    // circular point rendering
    if (length(gl_PointCoord - 0.5) > 0.5){
        discard;
    }

    gl_FragColor = vec4(adjustBrightnessContrastSaturation(vColor.xyz, brightnessContrastSaturation), vColor.w);

    #include <logdepthbuf_fragment>
}
