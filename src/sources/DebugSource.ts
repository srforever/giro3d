import {
    CanvasTexture,
    Color,
    MathUtils,
} from 'three';
import type Extent from '../core/geographic/Extent';
import PromiseUtils from '../utils/PromiseUtils.js';
import type { CustomContainsFn, GetImageOptions } from './ImageSource';
import ImageSource, { ImageResult } from './ImageSource';

class DebugSource extends ImageSource {
    readonly isDebugSource: boolean = true;
    private readonly delay: () => number;
    private readonly extent: Extent;
    private readonly opacity: number;
    private readonly subdivisions: number;
    private readonly color: Color;

    /**
     * @param options options
     * @param options.extent The extent.
     * @param options.delay The delay before loading the images.
     * @param options.opacity The opacity of the images.
     * @param options.color The color of the images.
     * @param options.subdivisions The how many images per tile are served.
     * @param options.containsFn The custom function to test if a given extent is contained in this
     * source.
     */
    constructor(options: {
        extent: Extent;
        delay: number;
        opacity: number;
        color: Color;
        subdivisions: number;
        containsFn?: CustomContainsFn;
    }) {
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

        this.type = 'DebugSource';

        this.extent = options.extent;
        this.opacity = opacity ?? 1;
        this.subdivisions = subdivisions ?? 1;
        this.color = color ?? new Color(1, 1, 1);
        this.extent = extent;
    }

    private getImage(width: number, height: number, id: string) {
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

    getCrs(): string {
        return this.extent.crs();
    }

    getExtent() {
        return this.extent;
    }

    getImages(options: GetImageOptions) {
        const {
            extent, width, height, signal, id,
        } = options;
        const subdivs = this.subdivisions;
        const extents = extent.split(subdivs, subdivs);

        const requests = [];

        const w = width / subdivs;
        const h = height / subdivs;

        for (const ex of extents) {
            const imageId = `${id}-${MathUtils.generateUUID()}`;
            const request = () => PromiseUtils.delay(this.delay())
                .then(() => {
                    signal?.throwIfAborted();
                    const texture = this.getImage(w, h, imageId);
                    return new ImageResult({ extent: ex, texture, id: imageId });
                });
            requests.push({ id: imageId, request });
        }

        return requests;
    }
}

export default DebugSource;
