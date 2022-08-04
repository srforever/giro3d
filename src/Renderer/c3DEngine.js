/**
 * Generated On: 2015-10-5
 * Class: C3DEngine
 * Description: 3DEngine est l'interface avec le framework webGL.
 */

import * as THREE from 'three';
import Capabilities from '../Core/System/Capabilities.js';

class C3DEngine {
    constructor(rendererOrDiv, options = {}) {
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

        const renderer = rendererOrDiv.domElement ? rendererOrDiv : undefined;
        const viewerDiv = renderer ? undefined : rendererOrDiv;

        this.width = (renderer ? renderer.domElement : viewerDiv).clientWidth;
        this.height = (renderer ? renderer.domElement : viewerDiv).clientHeight;

        this.positionBuffer = null;
        this._nextThreejsLayer = 1;

        this.fullSizeRenderTarget = new THREE.WebGLRenderTarget(this.width, this.height);
        this.fullSizeRenderTarget.texture.minFilter = THREE.LinearFilter;
        this.fullSizeRenderTarget.texture.magFilter = THREE.NearestFilter;
        this.fullSizeRenderTarget.texture.generateMipmaps = false;
        this.fullSizeRenderTarget.depthBuffer = true;
        this.fullSizeRenderTarget.depthTexture = new THREE.DepthTexture();
        this.fullSizeRenderTarget.depthTexture.type = THREE.UnsignedShortType;

        // Create renderer
        try {
            this.renderer = renderer || new THREE.WebGLRenderer({
                canvas: document.createElement('canvas'),
                antialias: options.antialias,
                alpha: options.alpha,
                logarithmicDepthBuffer: options.logarithmicDepthBuffer,
            });
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
                this.renderer = new THREE.WebGLRenderer({
                    canvas: _canvas,
                    antialias: options.antialias,
                    alpha: options.alpha,
                    logarithmicDepthBuffer: false,
                });
            }
        }

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
        this.renderer.autoClear = false;
        this.renderer.sortObjects = true;

        if (!renderer) {
            this.renderer.setPixelRatio(viewerDiv.devicePixelRatio);
            this.renderer.setSize(viewerDiv.clientWidth, viewerDiv.clientHeight);
            viewerDiv.appendChild(this.renderer.domElement);
        }
    }

    renderView(view, include2d) {
        this.renderer.setViewport(0, 0, this.width, this.height);
        this.renderer.clear();
        this.renderer.render(view.scene, view.camera.camera3D);

        if (include2d !== false) {
            this.renderer.clearDepth();
            this.renderer.render(view.scene2D, view.camera.camera2D);
        }
    }

    onWindowResize(w, h) {
        this.width = w;
        this.height = h;
        this.fullSizeRenderTarget.setSize(this.width, this.height);
        this.renderer.setSize(this.width, this.height);
    }

    /*
    * return
    */
    getWindowSize() {
        return new THREE.Vector2(this.width, this.height);
    }

    /**
     * return renderer THREE.js
     *
     * @returns {C3DEngine.THREE.WebGLRenderer} the Three.js WebGL renderer,
     * if any. Otherwise <code>undefined</code>
     */
    getRenderer() {
        return this.renderer;
    }

    /**
     * Render view to a Uint8Array.
     *
     * @param {module:Core/Instance~Instance} instance The giro3d instance to render
     * @param {object} [zone] partial zone to render
     * @param {number} zone.x x (in view coordinate)
     * @param {number} zone.y y (in view coordinate)
     * @param {number} zone.width width of area to render (in pixels)
     * @param {number} zone.height height of area to render (in pixels)
     * @returns {THREE.RenderTarget} - Uint8Array, 4 bytes per pixel. The first pixel in
     * the array is the bottom-left pixel.
     */
    renderViewToBuffer(instance, zone) {
        if (!zone) {
            zone = {
                x: 0,
                y: 0,
                width: this.width,
                height: this.height,
            };
        }

        this.renderViewToRenderTarget(instance, this.fullSizeRenderTarget, zone);

        zone.x = Math.max(0, Math.min(zone.x, this.width));
        zone.y = Math.max(0, Math.min(zone.y, this.height));

        const pixelBuffer = new Uint8Array(4 * zone.width * zone.height);
        this.renderer.readRenderTargetPixels(
            this.fullSizeRenderTarget,
            zone.x, this.height - (zone.y + zone.height), zone.width, zone.height, pixelBuffer,
        );

        return pixelBuffer;
    }

    /**
     * Render view to a THREE.RenderTarget.
     *
     * @param {module:Core/Instance~Instance} instance The giro3d instance to render
     * @param {THREE.RenderTarget} [target] destination render target. Default value: full size
     * render target owned by C3DEngine.
     * @param {object} [zone] partial zone to render (zone x/y uses view coordinates) Note: target
     * must contain complete zone
     * @returns {THREE.RenderTarget} - the destination render target
     */
    renderViewToRenderTarget(instance, target, zone) {
        if (!target) {
            target = this.fullSizeRenderTarget;
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
        this.renderer.render(instance.scene, instance.camera.camera3D);
        this.renderer.setRenderTarget(current);

        target.scissorTest = false;
        return target;
    }

    renderLayerTobuffer(view, layer, buffer, x, y, width, height) {
        // hide all layers but the requested one
        // TODO restore the ability to hide layers (not only objects)
        const previousVisibility = view._objects.map(l => l.visible);
        for (const v of view._objects) {
            v.visible = false;
        }
        layer.visible = true;

        const current = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(buffer);
        this.renderer.setViewport(0, 0, buffer.width, buffer.height);
        this.renderer.setScissor(x, y, width, height);
        this.renderer.setScissorTest(true);
        this.renderer.clear();
        this.renderer.render(layer.object3d, view.camera.camera3D);
        this.renderer.setScissorTest(false);
        const pixelBuffer = new Uint8Array(4 * width * height);
        this.renderer.readRenderTargetPixels(buffer, x, y, width, height, pixelBuffer);
        this.renderer.setRenderTarget(current);

        for (let i = 0; i < previousVisibility.length; i++) {
            view._objects[i].visible = previousVisibility[i];
        }

        return pixelBuffer;
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

    getUniqueThreejsLayer() {
        // We use three.js Object3D.layers feature to manage visibility of
        // geometry layers; so we need an internal counter to assign a new
        // one to each new geometry layer.
        // Warning: only 32 ([0, 31]) different layers can exist.
        if (this._nextThreejsLayer > 31) {
            console.warn('Too much three.js layers. Starting from now all of them will use layerMask = 31');
            this._nextThreejsLayer = 31;
        }

        const result = this._nextThreejsLayer++;

        return result;
    }
}

export default C3DEngine;
