/** @module Renderer/composition/WebGLComposer */
import {
    CanvasTexture,
    WebGLRenderer,
    WebGLRenderTarget,
    OrthographicCamera,
    Scene,
    Mesh,
    Texture,
    PlaneGeometry,
    RGBAFormat,
    ColorRepresentation,
    UnsignedByteType,
    FloatType,
    ClampToEdgeWrapping,
    Vector3,
} from 'three';

import Rect from '../../Core/Rect.js';
import MemoryTracker from '../MemoryTracker.js';
import ComposerTileMaterial from './ComposerTileMaterial.js';

const IMAGE_Z = -10;
const textureOwners = new Map();

function processTextureDisposal(event) {
    const texture = event.target;
    texture.removeEventListener('dispose', processTextureDisposal);
    const owner = textureOwners.get(texture.uuid);
    if (owner) {
        owner.dispose();
        textureOwners.delete(texture.uuid);
    } else {
        // This should never happen
        console.error('no owner for ', texture);
    }
}

/**
 * An implementation of the composer that uses a WebGL renderer.
 * This has many advantages over the {@link module:Renderer/composition/CanvasComposer}:
 * - Supports arbitrary pixel types (from 8-bit to 32-bit floating point)
 * - Supports arbitrary fragment shaders
 *
 * However, it is slower than its counterpart.
 *
 * @class WebGLComposer
 */
class WebGLComposer {
    /**
     * Creates an instance of WebGLComposer.
     *
     * @param {object} options The options.
     * @param {Rect} options.extent The extent of the canvas.
     * @param {number} options.width The canvas width, in pixels.
     * Ignored if a canvas is provided.
     * @param {number} options.height The canvas height, in pixels.
     * Ignored if a canvas is provided.
     * @param {boolean} [options.showImageOutlines=false] If true, yellow image outlines
     * will be drawn on images.
     * @param {boolean} [options.reuseTexture=false] If true, this composer will reuse the same
     * texture accross renders.
     * @param {boolean} [options.createDataCopy=false] If true, rendered textures will have a `data`
     * property containing the texture data (an array of either floats or bytes).
     * This is useful to read back the texture content.
     * @param {WebGLRenderer} options.webGLRenderer The WebGL renderer to use. This must be the
     * same renderer as the one used to display the rendered textures, because WebGL contexts are
     * isolated from each other.
     * @param {number} [options.pixelType=UnsignedByteType] If (only if `reuseTexture`is `true`),
     * this pixel type will be used for the render target. Defaults to `UnsignedByteType`.
     * @param {ColorRepresentation} [options.clearColor=undefined] The clear (background) color.
     */
    constructor(options) {
        this.showImageOutlines = options.showImageOutlines;
        this.extent = options.extent;
        this.reuseTexture = options.reuseTexture;
        this.width = options.width;
        this.height = options.height;
        this.renderer = options.webGLRenderer;
        this.createDataCopy = options.createDataCopy;

        if (options.reuseTexture) {
            // We are going to render into the same target over and over
            const target = this.createRenderTarget(options.pixelType || UnsignedByteType);

            this.renderTarget = target;
            this.texture = target.texture;
        }

        if (options.clearColor) {
            this.renderer.setClearColor(options.clearColor);
        }

        // An array containing textures that this composer has created, to be disposed later.
        this.ownedTextures = [];
        // An array containing all the textures on the current canvas, regardless of whether this
        // composer owns them or not.
        this.textures = [];

        this.scene = new Scene();

        const NEAR = 1;
        const FAR = 100;

        // Set the origin of the canvas at the center extent, so that everything should
        // not be too far from this point, to preserve floating-point precision.
        this.origin = new Vector3(this.extent.centerX, this.extent.centerY, 0);

        // Define a camera centered on (0, 0), with its
        // orthographic size matching size of the extent.
        const halfWidth = this.extent.width / 2;
        const halfHeight = this.extent.height / 2;
        this.camera = new OrthographicCamera(
            -halfWidth,
            +halfWidth,
            +halfHeight,
            -halfHeight,
            NEAR,
            FAR,
        );
    }

    createRenderTarget(pixelType) {
        const result = new WebGLRenderTarget(
            this.width,
            this.height, {
                format: RGBAFormat,
                type: pixelType,
                depthBuffer: false,
                generateMipmaps: false,
            },
        );

        // Normally, the render target "owns" the texture, and whenever this target
        // is disposed, the texture is disposed with it.
        // However, in our case, we cannot rely on this behaviour because the owner is the composer
        // itself, whose lifetime can be shorter than the texture it created.
        textureOwners.set(result.texture.uuid, result);
        result.texture.addEventListener('dispose', processTextureDisposal);

        if (__DEBUG__) {
            MemoryTracker.track(result, 'WebGLRenderTarget');
            MemoryTracker.track(result.texture, 'WebGLRenderTarget.texture');
        }

        return result;
    }

    /**
     * Draws an image to the composer.
     *
     * @param {Texture|HTMLImageElement|HTMLCanvasElement} texture The texture to add.
     * @param {Rect} extent The extent of this texture in the composition space.
     */
    draw(texture, extent) {
        const geometry = new PlaneGeometry(extent.width, extent.height, 1, 1);
        if (!texture.isTexture) {
            texture = new Texture(texture);
            texture.needsUpdate = true;
            this.ownedTextures.push(texture);
            if (__DEBUG__) {
                MemoryTracker.track(texture, 'WebGLComposer quad');
            }
        }
        this.textures.push(texture);
        const material = new ComposerTileMaterial(
            texture,
            {
                showImageOutlines: this.showImageOutlines,
            },
        );
        if (__DEBUG__) {
            MemoryTracker.track(geometry, 'WebGLComposer quad');
            MemoryTracker.track(material, 'WebGLComposer quad');
        }
        const plane = new Mesh(geometry, material);
        this.scene.add(plane);

        plane.position.set(extent.centerX - this.origin.x, extent.centerY - this.origin.y, IMAGE_Z);
    }

    /**
     * Resets the composer to a blank state.
     *
     * @memberof WebGLComposer
     */
    reset() {
        this.removeTextures();
        this.removeObjects();
        this.renderer.clear();
    }

    /**
     * Clears the canvas.
     *
     * @param {Rect} [rect=undefined] The region of the canvas to clear.
     * If undefined, the whole canvas is cleared.
     */
    clear(rect) {
        if (rect) {
            const {
                x, y, w, h,
            } = Rect.getNormalizedRect(rect, this.extent);
            this.renderer.setScissorTest(true);
            this.renderer.setScissor(x, y, w, h);
        }
        this.renderer.clear();
        if (rect) {
            // Reset the scissors to the whole canvas
            this.renderer.setScissorTest(false);
            this.renderer.setScissor(0, 0, this.width, this.height);
        }
    }

    removeObjects() {
        const childrenCopy = [...this.scene.children];
        for (const child of childrenCopy) {
            child.geometry.dispose();
            child.material.dispose();
            this.scene.remove(child);
        }
    }

    /**
     * Renders the composer into a texture.
     *
     * @returns {CanvasTexture | Texture} Either a CanvasTexture if the canvas was specified,
     * otherwise the texture of the render target.
     */
    render() {
        const previousTarget = this.renderer.getRenderTarget();

        // Should we reuse the same render target or create a new one ?
        let target;
        if (!this.renderTarget) {
            // We create a new render target for this render
            const pixelType = selectPixelType(this.textures);
            target = this.createRenderTarget(pixelType);
        } else {
            // We reuse the same render target across all renders
            target = this.renderTarget;
        }
        this.renderer.setRenderTarget(target);

        this.renderer.render(this.scene, this.camera);

        // Restore whatever render target was set on the renderer
        this.renderer.setRenderTarget(previousTarget);

        if (this.createDataCopy) {
            // Render target textures don't have data in CPU memory,
            // we need to transfer their data into a buffer.
            const bufSize = this.width * this.height * 4; // 4 channels : RGBA
            const buf = target.texture.type === UnsignedByteType
                ? new Uint8Array(bufSize)
                : new Float32Array(bufSize);
            this.renderer.readRenderTargetPixels(target, 0, 0, this.width, this.height, buf);
            target.texture.data = buf;
        }

        target.texture.wrapS = ClampToEdgeWrapping;
        target.texture.wrapT = ClampToEdgeWrapping;
        return target.texture;
    }

    removeTextures() {
        this.ownedTextures.forEach(t => t.dispose());
        this.ownedTextures.length = 0;

        this.textures.length = 0;
    }

    /**
     * Disposes all unmanaged resources in this composer.
     */
    dispose() {
        this.removeTextures();
        this.removeObjects();
        if (this.renderTarget) {
            this.renderTarget.dispose();
        }
    }
}

function selectPixelType(textures) {
    for (const texture of textures) {
        if (texture.type !== UnsignedByteType) {
            return FloatType;
        }
    }

    return UnsignedByteType;
}

export default WebGLComposer;
