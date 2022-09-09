import Extent from '../Core/Geographic/Extent.js';

const tmp = {
    dim: { x: 0, y: 0 },
};

/**
 * Returns the equivalent rectangle of `source` normalized over the dimensions of `dest`.
 *
 * @param {Extent} source The source extent.
 * @param {GeographicCanvas} canvas The destination canvas.
 */
export function toCanvasNormalizedCoordinates(source, canvas) {
    const dest = canvas.extent;
    const dstDim = canvas.dimensions;
    const srcDim = source.dimensions(tmp.dim);
    let x = (source.west() - dest.west()) / dstDim.x;
    // We reverse north and south because canvas coordinates are top left corner based,
    // whereas extents are bottom left based.
    let y = (dest.north() - source.north()) / dstDim.y;

    let w = srcDim.x / dstDim.x;
    let h = srcDim.y / dstDim.y;

    // Necessary to avoid seams between tiles due to problems in
    // floating point precision when tile size is a multiple of the canvas size.
    const precision = 10 ** 10;

    x = (Math.round((x + Number.EPSILON) * precision) / precision);
    y = (Math.round((y + Number.EPSILON) * precision) / precision);
    w = (Math.round((w + Number.EPSILON) * precision) / precision);
    h = (Math.round((h + Number.EPSILON) * precision) / precision);

    return {
        x, y, w, h,
    };
}

/**
 * An utility class over a rendering context to draw geographic images.
 */
class GeographicCanvas {
    /**
     * Creates an instance of GeographicCanvas.
     *
     * @param {object} [options={}] The options.
     * @param {boolean} options.showImageOutlines If true, yellow image outlines
     * will be drawn on images.
     * @param {HTMLCanvasElement} [options.canvas=undefined] If specified, this canvas will be used.
     * Otherwise a new canvas will be created.
     * @param {Extent} options.extent The extent of the canvas.
     * @param {number} [options.width=undefined] The canvas width, in pixels.
     * Ignored if a canvas is provided.
     * @param {number} [options.height=undefined] The canvas height, in pixels.
     * Ignored if a canvas is provided.
     * this color, otherwise it is transparent.
     * @memberof GeographicCanvas
     */
    constructor(options = {}) {
        this.extent = options.extent;
        this.dimensions = this.extent.dimensions();
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
     * @param {any} image The image to draw.
     * @param {Extent} extent The image extent.
     * @memberof GeographicCanvas
     */
    draw(image, extent) {
        const normalized = toCanvasNormalizedCoordinates(extent, this);

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
            this.context.strokeStyle = 'yellow';
            this.context.rect(dx, dy, dw, dh);
            this.context.stroke();
        }
    }

    /**
     * Gets the image content of the canvas.
     *
     * @returns {Promise<Image>} The resulting image.
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
}

export default GeographicCanvas;
