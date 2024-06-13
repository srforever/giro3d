import { type WebGLRenderer } from 'three';

// default values
let logDepthBufferSupported = false;
let maxTexturesUnits = 8;
let maxTextureSize = 2048;

export default {
    isLogDepthBufferSupported() {
        return logDepthBufferSupported;
    },
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
        logDepthBufferSupported = renderer.capabilities.logarithmicDepthBuffer;
    },
};
