uniform sampler2D depthTexture;
uniform sampler2D colorTexture;

varying vec2 vUv;

uniform vec2 resolution;


void main() {
    float depth = texture2D(depthTexture, vUv).x;
    if (depth == 1.0) {
        return;
    }


    const int kernelSize = 1;
    int count = 0;
    float average = 0.0;
    float averageSq = 0.0;
    for (int i=-kernelSize; i<=kernelSize; i++) {
        for (int j=-kernelSize; j<=kernelSize; j++) {
            if (i == 0 && j ==0) continue;
            float d = texture2D(depthTexture,
                vUv + vec2(float(i) / resolution.x, float(j) / resolution.y)).x;

            if (d < 1.0) {
                average += d;
                averageSq += d * d;
                count ++;
            }
        }
    }

    float w = 1.0;
    if (count > 0) {
        average /= float(count);

        float variance = averageSq / float(count) - pow(average, 2.0);

        vec2 interval = vec2(average - variance, average + variance);

        w = clamp(1.0 - abs(depth - interval.x) / (interval.y - interval.x + 0.0001),
            0.5,
            1.0);
    }

    vec4 color = texture2D(colorTexture, vUv);
    color.rgb *= w;
    gl_FragColor = color;
}
