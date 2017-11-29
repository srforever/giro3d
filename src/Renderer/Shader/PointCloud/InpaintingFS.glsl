uniform sampler2D depthTexture;
uniform sampler2D colorTexture;

varying vec2 vUv;

uniform vec2 resolution;
uniform float depth_contrib;
uniform float opacity;

void main() {
    float depth = texture2D(depthTexture, vUv).x;
    gl_FragDepthEXT = depth;

    // non empty pixel
    if (depth < 1.0) {
        gl_FragColor = texture2D(colorTexture, vUv);
        return;
    }

    // empty pixel
    {
        float total_weight = 0.0;
        vec4 averageColor = vec4(0.0, 0.0, 0.0, 0.0);
        float averageDepth = 0.;
        const int kernel = 3;
        for (int i=-kernel; i<=kernel; i++) {
            for (int j=-kernel; j<=kernel; j++) {
                if (i == 0 && j == 0) continue;
                vec2 uv = vUv + vec2(float(i) / resolution.x, float(j) / resolution.y);
                float d = texture2D(depthTexture, uv).x;

                if (d < 1.0) {
                    float r_ij = sqrt(float(i*i + j*j));
                    float weight_ij = (float(kernel) - r_ij * 0.5) * (1.0 - min(1.0, abs(d - depth) / depth_contrib));
                    if (weight_ij > 0.0) {
                        averageColor += weight_ij * texture2D(colorTexture, uv);
                        averageDepth += weight_ij * d;
                        total_weight += weight_ij;
                    }
                }
            }
        }

        if (total_weight > 0.0) {
            gl_FragColor = averageColor / total_weight;
            gl_FragDepthEXT = averageDepth / total_weight;
        } else {
            gl_FragColor.a = 0.0;
            discard;
        }
    }
}
