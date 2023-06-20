/**
 * @module sources/CustomTiledImageSource
 */

import Flatbush from 'flatbush';
import { Vector2 } from 'three';
import Fetcher from '../utils/Fetcher.js';
import ImageSource, { ImageResult } from './ImageSource.js';
import Extent from '../core/geographic/Extent.js';
import TextureGenerator from '../utils/TextureGenerator.js';

async function loadImage(url, signal) {
    const blob = await Fetcher.blob(url, { signal });
    signal?.throwIfAborted();
    const texture = TextureGenerator.decodeBlob(blob);
    return texture;
}

/**
 * @module sources/CustomTiledImageSource
 */

const temp = {
    dim: new Vector2(),
};

/**
 * Data source for custom tilesets.
 *
 * @api
 */
class CustomTiledImageSource extends ImageSource {
    /**
     * Creates a CustomTiledImageSource source.
     *
     * @param {object} options options
     * @param {string} options.url the url of the tileset metadata
     * @param {object} options.networkOptions Network options
     * @param {string} options.crs The CRS of this source.
     */
    constructor(options) {
        super({ flipY: true });
        this.url = new URL(options.url, window.location);
        this.networkOptions = options.networkOptions;
        this.crs = options.crs;
        this.images = [];
    }

    async initialize() {
        const metadata = await this.fetchMetadata();

        for (const image of Object.keys(metadata)) {
            const extent = new Extent(this.crs, ...metadata[image]);
            const dim = extent.dimensions(temp.dim);
            const size = Math.max(dim.x, dim.y);
            const url = this.buildUrl(image);
            this.images.push({
                image,
                extent,
                size,
                url,
            });
        }
        this.spatialIndex = new Flatbush(this.images.length);
        for (const image of this.images) {
            this.spatialIndex.add(
                image.extent.west(),
                image.extent.south(),
                image.extent.east(),
                image.extent.north(),
            );
        }
        this.spatialIndex.finish();
    }

    getExtent() {
        if (this.extent == null) {
            this.extent = new Extent(
                this.crs,
                this.spatialIndex.minX,
                this.spatialIndex.maxX,
                this.spatialIndex.minY,
                this.spatialIndex.maxY,
            );
        }

        return this.extent;
    }

    /**
     * Gets the images for the specified extent and pixel size.
     *
     * @api
     * @param {object} options The options.
     * @param {Extent} options.extent The extent of the request area.
     * @param {number} options.width The pixel width of the request area.
     * @param {number} options.height The pixel height of the request area.
     * @param {AbortSignal} options.signal The abort signal.
     * @returns {Array<{ id: number, request: Promise<ImageResult>}>} The generated images.
     */
    getImages(options) {
        const { signal, extent } = options;
        const images = this.getImagesInIndex(extent);

        const result = [];

        for (const image of images) {
            const id = image.url;
            const request = async () => {
                const texture = await loadImage(image.url, signal);
                return new ImageResult({
                    texture, id, extent: image.extent,
                });
            };

            result.push({ id, request });
        }

        return result;
    }

    /**
     * @param {Extent} extent The extent of the request.
     * @returns {Array} The candidates, ordered by descending size
     */
    getImagesInIndex(extent) {
        const xmin = extent.west();
        const xmax = extent.east();
        const ymin = extent.south();
        const ymax = extent.north();

        const candidates = this.spatialIndex
            .search(xmin, ymin, xmax, ymax)
            .map(i => this.images[i]);

        candidates.sort((a, b) => (b.size - a.size));

        return candidates;
    }

    /**
     * @param {Extent} extent The extent to test.
     * @returns {boolean} true if this source contains the extent.
     */
    contains(extent) {
        return this.images.some(img => extent.intersectsExtent(img.extent));
    }

    buildUrl(image) {
        return this.url.href.substring(0, this.url.href.lastIndexOf('/') + 1) + image;
    }

    fetchMetadata() {
        return Fetcher.json(this.url.href, this.networkOptions);
    }
}

export default CustomTiledImageSource;
