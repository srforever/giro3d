/**
 * @module sources/DebugSource
 */

import {
    CanvasTexture,
    Vector2,
    MathUtils,
    Color,
} from 'three';
import Extent from '../core/geographic/Extent';
import PromiseUtils from '../utils/PromiseUtils.js';
import ImageSource, { ImageResult } from './ImageSource.js';

const tmpVec2 = new Vector2();

class DebugSource extends ImageSource {
    /**
     * @param {object} options options
     * @param {Extent} options.extent The extent.
     * @param {number} options.delay The delay before loading the images.
     * @param {number} options.opacity The opacity of the images.
     * @param {Color} options.color The color of the images.
     * @param {number} options.subdivisions The how many images per tile are served.
     * @param {import('./ImageSource.js').CustomContainsFn} [options.containsFn] The custom function
     * to test if a given extent is contained in this source.
     */
    constructor(options) {
        super(options);
        const {
            delay, subdivisions, opacity, extent, color,
        } = options;
        if (delay) {
            if (typeof delay === 'function') {
                this.delay = delay;
            } else if (typeof delay === 'number') {
                this.delay = () => delay;
            }
        } else {
            this.delay = () => 0;
        }

        this.isDebugSource = true;
        this.type = 'DebugSource';

        this.extent = options.extent;
        this.opacity = opacity ?? 1;
        this.subdivisions = subdivisions ?? 1;
        this.color = color ?? new Color(1, 1, 1);
        this.count = 0;
        this.extent = extent;
        this.dimensions = this.extent.dimensions();
    }

    getInterpolator(extent) {
        const width = extent.dimensions(tmpVec2).x;
        const SMALLEST_WIDTH = this.dimensions.x / 1048576;
        return MathUtils.mapLinear(width, this.dimensions.x, SMALLEST_WIDTH, 0, 1);
    }

    getImage(width, height, id) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        const prefix = id.substring(0, 10);

        context.fillStyle = `#${this.color.getHexString()}`;
        context.globalAlpha = this.opacity ?? 1;
        context.fillRect(0, 0, width, height);
        context.globalAlpha = 1;
        context.strokeStyle = `#${this.color.getHexString()}`;
        context.lineWidth = 16;
        context.strokeRect(0, 0, width, height);
        context.fillStyle = 'black';

        const margin = 20;
        context.fillText(prefix, margin, margin);

        const texture = new CanvasTexture(canvas);

        return texture;
    }

    getExtent() {
        return this.extent;
    }

    /**
     * Gets the images for the specified extent and pixel size.
     *
     * @api
     * @param {object} options The options.
     * @param {Extent} options.extent The extent of the request area.
     * @param {string} options.id The identifier of the node that emitted the request.
     * @param {number} options.width The pixel width of the request area.
     * @param {number} options.height The pixel height of the request area.
     * @param {AbortSignal} options.signal The abort signal.
     * @returns {Array<{ id: string, request: Promise<ImageResult>}>} The generated images.
     */
    getImages(options) {
        const {
            extent, width, height, signal, id,
        } = options;
        const subdivs = this.subdivisions;
        const extents = extent.split(subdivs, subdivs);

        const requests = [];

        const w = width / subdivs;
        const h = height / subdivs;

        for (const ex of extents) {
            const request = () => PromiseUtils.delay(this.delay())
                .then(() => {
                    signal?.throwIfAborted();
                    const texture = this.getImage(w, h, id);
                    return new ImageResult({ extent: ex, texture, id });
                });
            requests.push({ id, request });
        }

        return requests;
    }
}

export default DebugSource;
