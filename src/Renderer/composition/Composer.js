import {
    Texture, UnsignedByteType, WebGLRenderer,
} from 'three';
import Rect from '../../Core/Rect.js';
import CanvasComposer from './CanvasComposer.js';
import WebGLComposer from './WebGLComposer.js';

function shouldUseWebGLImpl(commandBuffer) {
    for (const { texture } of commandBuffer) {
        if (texture.isTexture) {
            // Only the WebGL renderer supports non 8-bit images
            if (texture.type !== UnsignedByteType) {
                return true;
            }
            // The Canvas composer only supports those types of underlying images
            if (!(texture.image instanceof HTMLImageElement
                || texture.image instanceof HTMLCanvasElement
                || texture.image instanceof HTMLVideoElement)) {
                return true;
            }
        }
    }

    return false;
}

function renderCommandBuffer(composer, commandBuffer) {
    for (const { texture, extent } of commandBuffer) {
        composer.draw(texture, extent);
    }

    commandBuffer.length = 0;

    return composer.render();
}

class Composer {
    /**
     * Creates an instance of Composer.
     *
     * @param {object} options Constructor options.
     * @param {number} options.width The width in pixel of the composer canvas.
     * @param {number} options.height The height in pixel of the composer canvas.
     * @param {Rect} options.extent The extent of composer canvas, in 2D space.
     * @param {boolean} options.createDataCopy For WebGL composer only, should we add a copy
     * of the pixel buffer to the texture itself ?
     * @param {WebGLRenderer} options.webGLRenderer The WebGL renderer, to create instances of
     * WebGL composers.
     * @param {boolean} options.showImageOutlines Enables drawing of image outlines.
     */
    constructor(options) {
        this.width = options.width;
        this.height = options.height;
        this.extent = options.extent;
        this.showImageOutlines = options.showImageOutlines;
        this.webGLRenderer = options.webGLRenderer;
        this.createDataCopy = options.createDataCopy || false;

        this.commandBuffer = [];

        // We are only going to create one if needed.
        this.webGLComposer = null;
    }

    /**
     * Draws an image or texture in the composer.
     *
     * @param {Texture|HTMLImageElement|HTMLCanvasElement} texture The texture or image to draw.
     * @param {Rect} extent The extent of this texture in the composition space.
     */
    draw(texture, extent) {
        // We are not actually drawing anything right now, not until we call render().
        this.commandBuffer.push({ texture, extent });
    }

    renderUsingWebGL() {
        if (!this.webGLComposer) {
            this.webGLComposer = new WebGLComposer({
                width: this.width,
                height: this.height,
                showImageOutlines: this.showImageOutlines,
                extent: this.extent,
                createDataCopy: this.createDataCopy,
                webGLRenderer: this.webGLRenderer,
            });
        }

        const result = renderCommandBuffer(this.webGLComposer, this.commandBuffer);

        this.webGLComposer.dispose();

        return result;
    }

    renderUsingHtmlCanvas() {
        const composer = new CanvasComposer({
            width: this.width,
            height: this.height,
            showImageOutlines: this.showImageOutlines,
            extent: this.extent,
        });

        return renderCommandBuffer(composer, this.commandBuffer);
    }

    /**
     * Renders the composer into a texture.
     *
     * @returns {Texture} The produced texture.
     */
    render() {
        if (shouldUseWebGLImpl(this.commandBuffer)) {
            return this.renderUsingWebGL();
        }

        return this.renderUsingHtmlCanvas();
    }

    dispose() {
        if (this.webGLComposer) {
            this.webGLComposer.dispose();
        }
    }
}

export default Composer;
