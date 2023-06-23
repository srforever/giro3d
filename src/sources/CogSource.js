/**
 * @module sources/CogSource
 */

import {
    FloatType,
    LinearFilter,
    Texture,
    UnsignedByteType,
    Vector2,
} from 'three';

import GeoTIFF, {
    fromUrl,
    GeoTIFFImage,
    Pool,
    TypedArray,
} from 'geotiff';

import HttpConfiguration from '../utils/HttpConfiguration.js';
import Extent from '../core/geographic/Extent.js';
import TextureGenerator from '../utils/TextureGenerator.js';
import PromiseUtils from '../utils/PromiseUtils.js';
import ImageSource, { ImageResult } from './ImageSource.js';
import { Cache } from '../core/Cache.js';

const tmpDim = new Vector2();

/**
 * A level in the COG pyramid.
 *
 * @typedef {object} Level
 * @property {GeoTIFFImage} image The level image.
 * @property {number} width The width in pixels.
 * @property {number} height The height in pixels.
 * @property {number} resolution The spatial resolution.
 */

function selectDataType(bytesPerPixel, bandCount) {
    if (bandCount === bytesPerPixel) {
        return UnsignedByteType;
    }

    return FloatType;
}

/**
 * Provides data from a Cloud Optimized GeoTIFF (COG).
 *
 * @api
 */
class CogSource extends ImageSource {
    /**
     * Creates a COG source.
     *
     * @param {object} options options
     * @param {string} options.url the url of the COG image
     * @param {string} options.crs the CRS of the COG image
     * @param {import('./ImageSource.js').CustomContainsFn} [options.containsFn] The custom function
     * to test if a given extent is contained in this source.
     */
    constructor(options) {
        super({ flipY: true });
        this.url = options.url;
        this.crs = options.crs;
        /** @type {GeoTIFF} */
        this.tiffImage = null;
        /** @type {Pool} */
        this.pool = window.Worker ? new Pool() : null;
        /** @type {number} */
        this.imageCount = 0;
        /** @type {Extent} */
        this.extent = null;
        /** @type {Vector2} */
        this.dimensions = null;
        /** @type {Array<Level>} */
        this.levels = [];
        /** @type {Cache} */
        this.cache = new Cache();
        /** @type {{width: number, height: number}} */
        this.pixelSize = null;
    }

    getExtent() {
        return this.extent;
    }

    /**
     * Attemps to compute the exact extent of the TIFF image.
     *
     * @param {string} crs The CRS.
     * @param {GeoTIFFImage} tiffImage The TIFF image.
     */
    static computeExtent(crs, tiffImage) {
        const [
            minx,
            miny,
            maxx,
            maxy,
        ] = tiffImage.getBoundingBox();

        const extent = new Extent(crs, minx, maxx, miny, maxy);
        return extent;
    }

    /**
     * @param {Extent} requestExtent The request extent.
     * @param {number} requestWidth The width, in pixels, of the request extent.
     * @param {number} requestHeight The height, in pixels, of the request extent.
     * @param {number} margin The margin, in pixels.
     * @returns {{extent: Extent, width: number, height: number}} The adjusted parameters.
     */
    adjustExtentAndPixelSize(requestExtent, requestWidth, requestHeight, margin) {
        const level = this.selectLevel(
            requestExtent,
            requestWidth,
            requestHeight,
        );

        const pixelWidth = this.dimensions.x / level.width;
        const pixelHeight = this.dimensions.y / level.height;

        const marginExtent = requestExtent
            .withMargin(pixelWidth * margin, pixelHeight * margin)
            .intersect(this.extent);

        const width = marginExtent.dimensions(tmpDim).x / pixelWidth;
        const height = marginExtent.dimensions(tmpDim).y / pixelHeight;

        return {
            extent: marginExtent,
            width,
            height,
        };
    }

    async initialize() {
        // Get the COG informations
        const opts = {};
        const url = this.url;
        HttpConfiguration.applyConfiguration(url, opts);
        this.tiffImage = await fromUrl(url, opts);

        // Number of images (original + overviews)
        this.imageCount = await this.tiffImage.getImageCount();
        // Get original image header
        const firstImage = await this.tiffImage.getImage();

        this.extent = CogSource.computeExtent(this.crs, firstImage);
        this.dimensions = this.extent.dimensions();

        this.origin = firstImage.getOrigin();
        this.bpp = firstImage.getBytesPerPixel();
        this.nodata = firstImage.getGDALNoData();

        this.pixelSize = { width: firstImage.getWidth(), height: firstImage.getHeight() };

        this.datatype = this.bpp === 4 ? UnsignedByteType : FloatType;

        /**
         * @param {GeoTIFFImage} image The GeoTIFF image.
         * @param {number} resolution The spatial resolution.
         * @returns {Level} The level.
         */
        function makeLevel(image, resolution) {
            return {
                image,
                width: image.getWidth(),
                height: image.getHeight(),
                resolution,
            };
        }

        this.levels.push(makeLevel(firstImage, firstImage.getResolution()));

        // We want to preserve the order of the overviews so we await them inside
        // the loop not to have the smallest overviews coming before the biggest
        /* eslint-disable no-await-in-loop */
        for (let i = 1; i < this.imageCount; i++) {
            const image = await this.tiffImage.getImage(i);
            this.levels.push(makeLevel(image, image.getResolution(firstImage)));
        }
    }

    /**
     * Returns a window in the image's coordinates that matches the requested extent.
     *
     * @param {Extent} extent The window extent.
     * @param {number} resolution The spatial resolution of the window.
     * @returns {Array<number>} The window.
     */
    makeWindowFromExtent(extent, resolution) {
        const [oX, oY] = this.origin;
        const [imageResX, imageResY] = resolution;
        const ext = extent._values;

        const wnd = [
            Math.round((ext[0] - oX) / imageResX),
            Math.round((ext[2] - oY) / imageResY),
            Math.round((ext[1] - oX) / imageResX),
            Math.round((ext[3] - oY) / imageResY),
        ];

        const xmin = Math.min(wnd[0], wnd[2]);
        let xmax = Math.max(wnd[0], wnd[2]);
        const ymin = Math.min(wnd[1], wnd[3]);
        let ymax = Math.max(wnd[1], wnd[3]);

        // prevent zero-sized requests
        if (Math.abs(xmax - xmin) === 0) {
            xmax += 1;
        }
        if (Math.abs(ymax - ymin) === 0) {
            ymax += 1;
        }

        return [xmin, ymin, xmax, ymax];
    }

    /**
     * Creates a texture from the pixel buffer(s).
     *
     * @param {TypedArray|TypedArray[]} buffers The buffers (one buffer per band)
     * @returns {Texture} The generated texture.
     */
    createTexture(buffers) {
        // Width and height in pixels of the returned data
        const { width, height } = buffers;

        const dataType = selectDataType(this.bpp, buffers.length);

        const texture = TextureGenerator.createDataTexture(
            {
                width,
                height,
                nodata: this.nodata,
            },
            dataType,
            ...buffers,
        );

        texture.magFilter = LinearFilter;
        texture.minFilter = LinearFilter;
        return texture;
    }

    /**
     * Select the best overview level (or the final image) to match the
     * requested extent and pixel width and height.
     *
     * @param {Extent} requestExtent The window extent.
     * @param {number} requestWidth The pixel width of the window.
     * @param {number} requestHeight The pixel height of the window.
     * @returns {Level} The selected zoom level.
     */
    selectLevel(requestExtent, requestWidth, requestHeight) {
        // Number of images  = original + overviews if any
        const imageCount = this.imageCount;
        const cropped = requestExtent.clone().intersect(this.extent);
        // Dimensions of the requested extent
        const extentDimension = cropped.dimensions(tmpDim);

        const targetResolution = Math.min(
            extentDimension.x / requestWidth,
            extentDimension.y / requestHeight,
        );

        let level;

        // Select the image with the best resolution for our needs
        for (let i = imageCount - 1; i >= 0; i--) {
            level = this.levels[i];
            const sourceResolution = Math.min(
                this.dimensions.x / level.width,
                this.dimensions.y / level.height,
            );

            if (targetResolution >= sourceResolution) {
                break;
            }
        }

        return level;
    }

    async loadImage(opts) {
        const {
            extent, width, height, id, signal,
        } = opts;

        const level = this.selectLevel(extent, width, height);

        const adjusted = extent.fitToGrid(
            this.extent,
            level.width,
            level.height,
            8,
            8,
        );

        const actualExtent = adjusted.extent;

        const buffers = await this.getRegionBuffers(actualExtent, level, signal, id);

        signal?.throwIfAborted();

        const texture = this.createTexture(buffers);

        const result = { extent: actualExtent, texture, id };

        return new ImageResult(result);
    }

    /**
     * @param {GeoTIFFImage} image The image to read.
     * @param {any} window The image region to read.
     * @param {AbortSignal} signal The abort signal.
     * @returns {Promise<TypedArray|TypedArray[]>} The buffers.
     */
    async fetchBuffer(image, window, signal) {
        try {
            signal?.throwIfAborted();

            // TODO possible optimization: instead of letting geotiff.js crop and resample
            // the tiles into the desired region, we could use image.getTileOrStrip() to
            // read individual tiles (aka blocks) and make a texture per block. This way,
            // there would not be multiple concurrent reads for the same block, and we would not
            // waste time resampling the blocks since resampling is already done in the composer.
            // We would create more textures, but it could be worth it.
            const buf = await image.readRasters({
                pool: this.pool,
                fillValue: this.nodata,
                window,
            });

            return buf;
        } catch (e) {
            if (e.toString() === 'AggregateError: Request failed') {
                // Problem with the source that is blocked by another fetch
                // (request failed in readRasters). See the conversations in
                // https://github.com/geotiffjs/geotiff.js/issues/218
                // https://github.com/geotiffjs/geotiff.js/issues/221
                // https://github.com/geotiffjs/geotiff.js/pull/224
                // Retry until it is not blocked.
                // TODO retry counter
                await PromiseUtils.delay(100);
                return this.fetchBuffer(image, window, signal);
            }
            throw e;
        }
    }

    /**
     * Extract a region from the specified image.
     *
     * @param {Extent} extent The request extent.
     * @param {Level} level The level to sample.
     * @param {AbortSignal} signal The abort signal.
     * @param {string} id The request id.
     * @returns {Promise<TypedArray|TypedArray[]>} The buffer(s).
     */
    async getRegionBuffers(extent, level, signal, id) {
        const window = this.makeWindowFromExtent(extent, level.resolution);

        const cached = this.cache.get(id);
        if (cached) {
            return cached;
        }

        const buf = await this.fetchBuffer(level.image, window, signal);
        let size = 0;
        if (Array.isArray(buf)) {
            size = buf.map(b => b.byteLength).reduce((a, b) => a + b);
        } else {
            size = buf.byteLength;
        }
        this.cache.set(id, buf, { size });

        return buf;
    }

    /**
     * Gets the images for the specified extent and pixel size.
     *
     * @api
     * @param {object} options The options.
     * @param {Extent} options.extent The extent of the request area.
     * @param {number} options.width The pixel width of the request area.
     * @param {number} options.height The pixel height of the request area.
     * @param {string} options.id The identifier of the client that emitted the request.
     * @param {AbortSignal} [options.signal] The optional abort signal.
     * @returns {Array<{ id: string, request: function(()):Promise<ImageResult>}>} The array
     * containing the image promises.
     */
    getImages(options) {
        const {
            signal,
            id,
        } = options;

        signal?.throwIfAborted();

        const opts = { id, ...options };

        const request = () => this.loadImage(opts);

        return [{ id, request }];
    }
}

export default CogSource;
