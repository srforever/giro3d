import {
    FloatType,
    LinearFilter,
    UnsignedByteType,
    Vector2,
} from 'three';

import {
    fromUrl,
    type TypedArray,
    GeoTIFFImage,
    Pool,
    GeoTIFF,
} from 'geotiff';

import HttpConfiguration from '../utils/HttpConfiguration.js';
import Extent from '../core/geographic/Extent';
import TextureGenerator from '../utils/TextureGenerator.js';
import PromiseUtils from '../utils/PromiseUtils.js';
import ImageSource, { CustomContainsFn, ImageResult } from './ImageSource.js';
import { Cache } from '../core/Cache.js';

const tmpDim = new Vector2();

/**
 * A level in the COG pyramid.
 */
interface Level {
    image: GeoTIFFImage;
    width: number;
    height: number;
    resolution: number[];
}

function selectDataType(format: number, bitsPerSample: number) {
    switch (format) {
        case 1: // unsigned integer data
            if (bitsPerSample <= 8) {
                return UnsignedByteType;
            }
            break;
        default:
            break;
    }
    return FloatType;
}

/**
 * Provides data from a Cloud Optimized GeoTIFF (COG).
 */
class CogSource extends ImageSource {
    readonly isCogSource: boolean = true;

    readonly url: string;
    readonly crs: string;
    readonly cache: Cache;
    private tiffImage: GeoTIFF;
    private readonly pool: Pool;
    private imageCount: number;
    private extent: Extent;
    private dimensions: Vector2;
    private levels: Level[];
    private sampleCount: number;
    private _channels: number[];
    private _initialized: boolean;
    private origin: number[];
    private nodata: number;
    private format: any;
    private bps: number;
    /**
     * Creates a COG source.
     *
     * @param options options
     * @param options.url the url of the COG image
     * @param options.crs the CRS of the COG image
     * @param options.containsFn The custom function
     * to test if a given extent is contained in this source.
     * @param options.channels How the samples in the GeoTIFF files (also
     * known as bands), are mapped to the color channels of an RGB(A) image.
     *
     * Must be an array of either 1, 3 or 4 elements. Each element is the index of a sample in the
     * source file. For example, to map the samples 0, 3, and 2 to the R, G, B colors, you can use
     * `[0, 3, 2]`.
     *
     * - 1 element means the resulting image will be a grayscale image
     * - 3 elements means the resulting image will be a RGB image
     * - 4 elements means the resulting image will be a RGB image with an alpha channel.
     *
     * Note: if the channels is `undefined`, then they will be selected automatically with the
     * following rules: if the image has 3 or more samples, the first 3 sample will be used,
     * (i.e `[0, 1, 2]`). Otherwise, only the first sample will be used (i.e `[0]`). In any case,
     * no transparency channel will be selected automatically, as there is no way to determine
     * if a specific sample represents transparency.
     *
     * ## Examples
     *
     * - I have a color image, but I only want to see the blue channel (sample = 1): `[1]`
     * - I have a grayscale image, with only 1 sample: `[0]`
     * - I have a grayscale image with a transparency channel at index 1: `[0, 0, 0, 1]`
     * - I have a color image without a transparency channel: `[0, 1, 2]`
     * - I have a color image with a transparency channel at index 3: `[0, 1, 2, 3]`
     * - I have a color image with transparency at index 3, but I only want to see the blue channel:
     * `[1, 1, 1, 3]`
     * - I have a color image but in the B, G, R order: `[2, 1, 0]`
     */
    constructor(options : {
        url: string,
        crs: string,
        channels?: number[],
        containsFn?: CustomContainsFn,
    }) {
        super({ flipY: true, ...options });

        this.type = 'CogSource';

        this.url = options.url;
        this.crs = options.crs;
        this.pool = window.Worker ? new Pool() : null;
        this.imageCount = 0;
        this.levels = [];
        this.cache = new Cache();
        this._channels = options.channels;
    }

    getExtent() {
        return this.extent;
    }

    getCrs() {
        return this.crs;
    }

    /**
     * Attemps to compute the exact extent of the TIFF image.
     *
     * @param crs The CRS.
     * @param tiffImage The TIFF image.
     */
    private static computeExtent(crs: string, tiffImage: GeoTIFFImage) {
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
     * @param requestExtent The request extent.
     * @param requestWidth The width, in pixels, of the request extent.
     * @param requestHeight The height, in pixels, of the request extent.
     * @param margin The margin, in pixels.
     * @returns The adjusted parameters.
     */
    adjustExtentAndPixelSize(
        requestExtent: Extent,
        requestWidth: number,
        requestHeight: number,
        margin: number,
    ) {
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
        if (this._initialized) {
            return;
        }

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
        // Samples are equivalent to GDAL's bands
        this.sampleCount = firstImage.getSamplesPerPixel();

        // Automatic selection of channels, if the user did not specify a mapping.
        if (this._channels == null || this._channels.length === 0) {
            if (this.sampleCount >= 3) {
                this._channels = [0, 1, 2];
            } else {
                this._channels = [0];
            }
        }

        this.nodata = firstImage.getGDALNoData();

        this.format = firstImage.getSampleFormat();
        this.bps = firstImage.getBitsPerSample();
        this.datatype = selectDataType(this.format, this.bps);

        function makeLevel(image: GeoTIFFImage, resolution: number[]): Level {
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

        this._initialized = true;
    }

    /**
     * Returns a window in the image's coordinates that matches the requested extent.
     *
     * @param extent The window extent.
     * @param resolution The spatial resolution of the window.
     * @returns The window.
     */
    private makeWindowFromExtent(extent: Extent, resolution: number[]) {
        const [oX, oY] = this.origin;
        const [imageResX, imageResY] = resolution;
        const ext = extent.values;

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
     * @param buffers The buffers (one buffer per band)
     * @returns The generated texture.
     */
    private createTexture(buffers: TypedArray[]) {
        // Width and height in pixels of the returned data.
        // The geotiff.js patches the arrays with the width and height properties.
        // @ts-ignore
        const { width, height } = buffers;

        const dataType = this.datatype;

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
     * @param requestExtent The window extent.
     * @param requestWidth The pixel width of the window.
     * @param requestHeight The pixel height of the window.
     * @returns The selected zoom level.
     */
    private selectLevel(requestExtent: Extent, requestWidth: number, requestHeight: number) {
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

    /**
     * Gets the channel mapping.
     */
    get channels() {
        return this._channels;
    }

    private async loadImage(opts: {
        extent: Extent,
        width: number,
        height: number,
        id: string,
        signal?: AbortSignal,
    }) {
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
     * @param image The image to read.
     * @param window The image region to read.
     * @param signal The abort signal.
     * @returns The buffers.
     */
    private async fetchBuffer(image: GeoTIFFImage, window: number[], signal?: AbortSignal)
        : Promise<TypedArray | TypedArray[]> {
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
                samples: this._channels,
                window,
                signal,
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
     * @param extent The request extent.
     * @param level The level to sample.
     * @param signal The abort signal.
     * @param id The request id.
     * @returns The buffer(s).
     */
    private async getRegionBuffers(extent: Extent, level: Level, signal: AbortSignal, id: string) {
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

    getImages(options: {
        id: string,
        extent: Extent,
        width: number,
        height: number,
        signal?: AbortSignal,
    }) {
        const {
            signal,
            id,
        } = options;

        signal?.throwIfAborted();

        const opts = { id, ...options };

        const request = () => this.loadImage(opts);

        return [{ id, request }];
    }

    dispose() {
        this.cache.clear();
    }
}

export default CogSource;
