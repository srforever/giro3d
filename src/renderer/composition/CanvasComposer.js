/** @module renderer/composition/CanvasComposer */
import { CanvasTexture, Texture } from 'three';
import Rect from '../../core/Rect.js';
import MemoryTracker from '../MemoryTracker.js';

/**
 * An implementation of the composer that uses an HTML canvas.
 * This only supports 8-bit images, but is faster than the
 * {@link module:Renderer/composition/WebGLComposer}
 *
 * @class CanvasComposer
 */
class CanvasComposer {
    /**
     * Creates an instance of CanvasComposer.
     *
     * @param {object} [options={}] The options.
     * @param {boolean} options.showImageOutlines If true, yellow image outlines
     * will be drawn on images.
     * @param {HTMLCanvasElement} [options.canvas=undefined] If specified, this canvas will be used.
     * Otherwise a new canvas will be created.
     * @param {Rect} options.extent The extent of the canvas.
     * @param {number} [options.width=undefined] The canvas width, in pixels.
     * Ignored if a canvas is provided.
     * @param {number} [options.height=undefined] The canvas height, in pixels.
     * Ignored if a canvas is provided.
     * this color, otherwise it is transparent.
     * @memberof CanvasComposer
     */
    constructor(options = {}) {
        this.extent = options.extent;
        this.showImageOutlines = options.showImageOutlines;

        if (options.canvas) {
            this.canvas = options.canvas;
        } else {
            this.canvas = document.createElement('canvas');
            this.canvas.width = options.width;
            this.canvas.height = options.height;
        }

        this.size = { w: this.canvas.width, h: this.canvas.height };
        this.context = this.canvas.getContext('2d');
    }

    /**
     * Clears the canvas with either the specified color or transparent pixels.
     *
     * @param {string} color The optional color. If not provided, transparent pixels are used.
     */
    clear(color = undefined) {
        // Clears the canvas with either the specified background color or transparent pixels.
        if (color) {
            this.context.fillStyle = color;
            this.context.rect(0, 0, this.canvas.width, this.canvas.height);
            this.context.fill();
        } else {
            // this is necessary because the canvas may have been previously used.
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    /**
     * Draws the image into the canvas, using the specified extent.
     *
     * @param {HTMLImageElement|HTMLCanvasElement|Texture|CanvasTexture} image The image to draw.
     * @param {Rect} extent The image extent.
     * @memberof CanvasComposer
     */
    draw(image, extent) {
        if (image.isTexture) {
            // If the image is actually the texture, then we are interested in the texture
            // source which must be a compatible 'image' (canvas or image element).
            image = image.image;
        }
        const normalized = Rect.getNormalizedRect(extent, this.extent);

        // Canvas coordinate are discrete, so we need to floor and ceil
        // to ensure that images are exactly where they are supposed to be.
        const dx = Math.floor(normalized.x * this.size.w);
        const dy = Math.floor(normalized.y * this.size.h);

        const dw = Math.ceil(normalized.w * this.size.w);
        const dh = Math.ceil(normalized.h * this.size.h);

        this.context.drawImage(image, dx, dy, dw, dh);

        // Optionally, display the outline of the images
        if (this.showImageOutlines) {
            this.context.beginPath();
            this.context.lineWidth = 2;
            this.context.strokeStyle = 'yellow';
            this.context.rect(dx, dy, dw, dh);
            this.context.stroke();
        }
    }

    /**
     * Gets the {@link HTMLImageElement} content of the canvas.
     *
     * Note: if this image is meant to be drawn into another canvas, use {@link getBitmap()}
     * instead, that provides much faster conversion times.
     *
     * @returns {Promise<HTMLImageElement>} The resulting image.
     */
    getImage() {
        // We need a promise because loading an image is asynchronous
        return new Promise((resolve, reject) => {
            const data = this.canvas.toDataURL();
            const result = new Image(this.canvas.width, this.canvas.height);
            result.onload = () => resolve(result);
            result.onerror = reject;
            result.src = data;
        });
    }

    /**
     * Gets the {@link ImageData} content of the canvas.
     *
     * This bitmap is suitable to be drawn into another canvas.
     *
     * @returns {ImageData} The data.
     */
    getImageData() {
        return this.context.getImageData(0, 0, this.size.w, this.size.h);
    }

    render() {
        const result = new CanvasTexture(this.canvas);
        result.generateMipmaps = false;
        MemoryTracker.track(result, 'CanvasComposer');
        return result;
    }

    // eslint-disable-next-line class-methods-use-this
    dispose() {
        // nothing to do.
    }
}

export default CanvasComposer;
