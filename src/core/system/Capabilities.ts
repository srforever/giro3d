import { type WebGLRenderer } from 'three';
import SampleTestFS from '../../renderer/shader/SampleTestFS.glsl';
import SampleTestVS from '../../renderer/shader/SampleTestVS.glsl';

// default values
let logDepthBufferSupported = false;
let maxTexturesUnits = 8;
let maxTextureSize = 2048;

function _WebGLShader(renderer: WebGLRenderer, type: number, source: string) {
    const gl = renderer.getContext();
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}

function isFirefox() {
    return (
        navigator &&
        navigator.userAgent &&
        navigator.userAgent.toLowerCase().indexOf('firefox') > -1
    );
}

export default {
    isLogDepthBufferSupported() {
        return logDepthBufferSupported;
    },
    isFirefox,
    getMaxTextureUnitsCount() {
        return maxTexturesUnits;
    },
    getMaxTextureSize() {
        return maxTextureSize;
    },
    updateCapabilities(renderer: WebGLRenderer) {
        const gl = renderer.getContext();
        maxTexturesUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
        maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

        const program = gl.createProgram();
        const glVertexShader = _WebGLShader(renderer, gl.VERTEX_SHADER, SampleTestVS);

        let fragmentShader = `#define SAMPLE ${maxTexturesUnits}\n`;
        fragmentShader += SampleTestFS;

        const glFragmentShader = _WebGLShader(renderer, gl.FRAGMENT_SHADER, fragmentShader);

        gl.attachShader(program, glVertexShader);
        gl.attachShader(program, glFragmentShader);
        gl.linkProgram(program);

        // XXX this might not be needed any more. Check the status of this bug, and supported fx
        if (gl.getProgramParameter(program, gl.LINK_STATUS) === false) {
            if (maxTexturesUnits > 16) {
                const info = gl.getProgramInfoLog(program);
                console.warn(
                    `${info}: using a maximum of 16 texture units instead of the reported value (${maxTexturesUnits})`,
                );
                if (isFirefox()) {
                    console.warn(`It can come from a Mesa/Firefox bug;
                        the shader compiles to an error when using more than 16 sampler uniforms,
                        see https://bugzilla.mozilla.org/show_bug.cgi?id=777028`);
                }
                maxTexturesUnits = 16;
            } else {
                throw new Error(`The GPU capabilities could not be determined accurately.
                    Impossible to link a shader with the Maximum texture units ${maxTexturesUnits}`);
            }
        }

        gl.deleteProgram(program);
        gl.deleteShader(glVertexShader);
        gl.deleteShader(glFragmentShader);
        logDepthBufferSupported = renderer.capabilities.logarithmicDepthBuffer;
    },
};
