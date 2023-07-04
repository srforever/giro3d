/**
 * Generated On: 2015-10-5
 * Class: C3DEngine
 * Description: 3DEngine est l'interface avec le framework webGL.
 */

import {
    Object3D,
    Camera,
    Color,
    DepthTexture,
    LinearFilter,
    NearestFilter,
    UnsignedShortType,
    Vector2,
    WebGLRenderer,
    WebGLRenderTarget,
    RGBAFormat,
    UnsignedByteType,
} from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import Capabilities from '../core/system/Capabilities.js';

const tmpClear = new Color();

function createRenderTarget(width, height, type) {
    const result = new WebGLRenderTarget(
        width,
        height, {
            type,
            format: RGBAFormat,
        },
    );
    result.texture.minFilter = LinearFilter;
    result.texture.magFilter = NearestFilter;
    result.texture.generateMipmaps = false;
    result.depthBuffer = true;
    result.depthTexture = new DepthTexture();
    result.depthTexture.type = UnsignedShortType;

    return result;
}

class C3DEngine {
    constructor(viewerDiv, options = {}) {
        // pick sensible default options
        if (options.antialias === undefined) {
            options.antialias = true;
        }
        if (options.alpha === undefined) {
            options.alpha = true;
        }
        if (options.logarithmicDepthBuffer === undefined) {
            options.logarithmicDepthBuffer = false;
        }
        if (options.clearColor === undefined) {
            // Set clearColor to false for transparent
            options.clearColor = 0x030508;
        }

        const renderer = options.renderer;

        this.width = viewerDiv.clientWidth;
        this.height = viewerDiv.clientHeight;

        this.positionBuffer = null;

        this.renderTargets = new Map();

        /** @type {WebGLRenderer} */
        this.renderer = null;

        // Create renderer
        try {
            this.renderer = renderer || new WebGLRenderer({
                canvas: document.createElement('canvas'),
                antialias: options.antialias,
                alpha: options.alpha,
                logarithmicDepthBuffer: options.logarithmicDepthBuffer,
            });
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.clear();
        } catch (ex) {
            console.error('Failed to create WebGLRenderer', ex);
            this.renderer = null;
        }

        if (!this.renderer) {
            // from Detector.js
            const element = document.createElement('div');
            element.id = 'webgl-error-message';
            element.style.fontFamily = 'monospace';
            element.style.fontSize = '13px';
            element.style.fontWeight = 'normal';
            element.style.textAlign = 'center';
            element.style.background = '#fff';
            element.style.color = '#000';
            element.style.padding = '1.5em';
            element.style.width = '400px';
            element.style.margin = '5em auto 0';
            element.innerHTML = window.WebGLRenderingContext ? [
                'Your graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br />',
                'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.<br>',
                'See also <a href="https://www.khronos.org/webgl/wiki/BlacklistsAndWhitelists">graphics card blacklisting</a>',
            ].join('\n') : [
                'Your browser does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br/>',
                'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.<br>',
                'You can also try another browser like Firefox or Chrome.',
            ].join('\n');
            viewerDiv.appendChild(element);
            throw new Error('WebGL unsupported');
        }

        if (!renderer && options.logarithmicDepthBuffer) {
            // We don't support logarithmicDepthBuffer when EXT_frag_depth is missing.
            // So recreated a renderer if needed.
            if (!this.renderer.extensions.get('EXT_frag_depth')) {
                const _canvas = this.renderer.domElement;
                this.renderer.dispose();
                this.renderer = new WebGLRenderer({
                    canvas: _canvas,
                    antialias: options.antialias,
                    alpha: options.alpha,
                    logarithmicDepthBuffer: false,
                });
            }
        }

        // Don't verify shaders if not debug (it is very costly)
        this.renderer.debug.checkShaderErrors = options.checkShaderErrors ?? __DEBUG__;
        this.labelRenderer = new CSS2DRenderer();

        // Let's allow our canvas to take focus
        // The condition below looks weird, but it's correct: querying tabIndex
        // returns -1 if not set, but we still need to explicitly set it to force
        // the tabindex focus flag to true (see
        // https://www.w3.org/TR/html5/editing.html#specially-focusable)
        if (this.renderer.domElement.tabIndex === -1) {
            this.renderer.domElement.tabIndex = -1;
        }

        Capabilities.updateCapabilities(this.renderer);

        if (options.clearColor !== false) {
            this.renderer.setClearColor(options.clearColor);
        }
        this.renderer.clear();
        this.renderer.autoClear = false;
        this.renderer.sortObjects = true;

        // Finalize DOM insertion:
        // Ensure display is OK whatever the page layout is
        // - By default canvas has `display: inline-block`, which makes it affected by
        // its parent's line-height, so it will take more space than it's actual size
        // - Setting `display: block` is not enough in flex displays
        this.renderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        // Make sure labelRenderer starts a new stacking context, so the labels don't
        // stay on top of other components (e.g. inspector, etc.)
        this.labelRenderer.domElement.style.zIndex = 0;

        // Set default size
        this.renderer.setPixelRatio(viewerDiv.devicePixelRatio);
        this.renderer.setSize(this.width, this.height);
        this.labelRenderer.setSize(this.width, this.height);

        // Append renderer to the DOM
        viewerDiv.appendChild(this.renderer.domElement);
        viewerDiv.appendChild(this.labelRenderer.domElement);
    }

    dispose() {
        for (const rt of this.renderTargets.values()) {
            rt.dispose();
        }
        this.renderTargets.clear();
        this.labelRenderer.domElement.remove();
        this.renderer.domElement.remove();
        this.renderer.dispose();
    }

    render(instance, include2d) {
        this.renderer.setViewport(0, 0, this.width, this.height);
        this.renderer.clear();
        this.renderer.render(instance.scene, instance.camera.camera3D);

        this.labelRenderer.render(instance.scene, instance.camera.camera3D);

        if (include2d !== false) {
            this.renderer.clearDepth();
            this.renderer.render(instance.scene2D, instance.camera.camera2D);
        }
    }

    onWindowResize(w, h) {
        this.width = w;
        this.height = h;
        for (const rt of this.renderTargets.values()) {
            rt.setSize(this.width, this.height);
        }
        this.renderer.setSize(this.width, this.height);
        this.labelRenderer.setSize(this.width, this.height);
    }

    /*
    * return
    */
    getWindowSize() {
        return new Vector2(this.width, this.height);
    }

    /**
     * return renderer js
     *
     * @returns {C3DEngine.WebGLRenderer} the js WebGL renderer,
     * if any. Otherwise <code>undefined</code>
     */
    getRenderer() {
        return this.renderer;
    }

    /**
     * Render instance to a Uint8Array.
     *
     * @param {object} options Options.
     * @param {Color} options.clearColor The clear color to apply before rendering.
     * @param {Object3D} options.scene The scene to render.
     * @param {Camera} options.camera The camera to render.
     * @param {object} [options.zone] partial zone to render. If undefined, the whole
     * viewport is used.
     * @param {number} options.zone.x x (in instance coordinate)
     * @param {number} options.zone.y y (in instance coordinate)
     * @param {number} options.zone.width width of area to render (in pixels)
     * @param {number} options.zone.height height of area to render (in pixels)
     * @returns {Uint8Array} - Uint8Array, 4 bytes per pixel. The first pixel in
     * the array is the bottom-left pixel.
     */
    renderToBuffer(options) {
        const zone = options.zone || {
            x: 0,
            y: 0,
            width: this.width,
            height: this.height,
        };

        const { scene, camera } = options;

        const clear = this.renderer.getClearColor(tmpClear);
        const alpha = this.renderer.getClearAlpha();

        if (options.clearColor) {
            this.renderer.setClearColor(options.clearColor, 1);
        }

        const datatype = options.datatype ?? UnsignedByteType;

        if (!this.renderTargets.has(datatype)) {
            const newRenderTarget = createRenderTarget(this.width, this.height, datatype);
            this.renderTargets.set(datatype, newRenderTarget);
        }
        const renderTarget = this.renderTargets.get(datatype);

        this.renderInstanceToRenderTarget(scene, camera, renderTarget, zone);

        this.renderer.setClearColor(clear, alpha);

        zone.x = Math.max(0, Math.min(zone.x, this.width));
        zone.y = Math.max(0, Math.min(zone.y, this.height));

        const size = 4 * zone.width * zone.height;
        const pixelBuffer = datatype === UnsignedByteType
            ? new Uint8Array(size)
            : new Float32Array(size);
        this.renderer.readRenderTargetPixels(
            renderTarget,
            zone.x, this.height - (zone.y + zone.height), zone.width, zone.height, pixelBuffer,
        );

        return pixelBuffer;
    }

    /**
     * Render view to a render target.
     *
     * @param {Object3D} scene The scene root.
     * @param {Camera} camera The camera to render.
     * @param {WebGLRenderTarget} [target] destination render target. Default value: full size
     * render target owned by C3DEngine.
     * @param {object} [zone] partial zone to render (zone x/y uses canvas coordinates)
     * Note: target must contain complete zone
     * @returns {WebGLRenderTarget} - the destination render target
     */
    renderInstanceToRenderTarget(scene, camera, target, zone) {
        if (!target) {
            target = this.renderTargets.get(UnsignedByteType);
        }
        const current = this.renderer.getRenderTarget();

        // Don't use setViewport / setScissor on renderer because they would affect
        // on screen rendering as well. Instead set them on the render target.
        target.viewport.set(0, 0, target.width, target.height);
        if (zone) {
            target.scissor.set(
                Math.max(0, zone.x),
                Math.max(target.height - (zone.y + zone.height)),
                zone.width,
                zone.height,
            );
            target.scissorTest = true;
        }

        this.renderer.setRenderTarget(target);
        this.renderer.clear();
        this.renderer.render(scene, camera);
        this.renderer.setRenderTarget(current);

        target.scissorTest = false;
        return target;
    }

    static bufferToImage(pixelBuffer, width, height) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // size the canvas to your desired image
        canvas.width = width;
        canvas.height = height;

        const imgData = ctx.getImageData(0, 0, width, height);
        imgData.data.set(pixelBuffer);

        ctx.putImageData(imgData, 0, 0);

        // create a new img object
        const image = new Image();

        // set the img.src to the canvas data url
        image.src = canvas.toDataURL();

        return image;
    }
}

export default C3DEngine;
