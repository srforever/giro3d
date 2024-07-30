import {
    EventDispatcher,
    type Texture,
    UnsignedByteType,
    FloatType,
    type TextureDataType,
    type ColorSpace,
    SRGBColorSpace,
    LinearSRGBColorSpace,
} from 'three';
import type Extent from '../core/geographic/Extent';
import type MemoryUsage from '../core/MemoryUsage';
import {
    createEmptyReport,
    type GetMemoryUsageContext,
    type MemoryUsageReport,
} from '../core/MemoryUsage';

class ImageResult {
    id: string;
    texture: Texture;
    extent: Extent;
    min: number;
    max: number;
    /**
     * @param options - options
     */
    constructor(options: {
        /** The unique identifier of this result. */
        id: string;
        /** The texture */
        texture: Texture;
        /** The extent */
        extent: Extent;
        /** The minimum value of this image (if applicable). */
        min?: number;
        /** The maximum value of this image (if applicable). */
        max?: number;
    }) {
        if (!options.id) {
            throw new Error('id cannot be null');
        }
        if (!options.texture) {
            throw new Error('texture cannot be null');
        }
        if (!options.extent) {
            throw new Error('extent cannot be null');
        }
        this.id = options.id;
        this.texture = options.texture;
        this.extent = options.extent;
        this.min = options.min ?? 0;
        this.max = options.max ?? 0;
    }
}

export type CustomContainsFn = (extent: Extent) => boolean;

export interface GetImageOptions {
    /** The identifier of the node that emitted the request. */
    id: string;
    /** The extent of the request area. */
    extent: Extent;
    /** The pixel width of the request area. */
    width: number;
    /** The pixel height of the request area. */
    height: number;
    /** If `true`, the generated textures must be readable (i.e `DataTextures`). */
    createReadableTextures: boolean;
    /** The optional abort signal. */
    signal?: AbortSignal;
}

export interface ImageResponse {
    id: string;
    request: () => Promise<ImageResult>;
}

export interface ImageSourceOptions {
    /**
     * Should images be flipped vertically during composition ?
     */
    flipY?: boolean;
    /**
     * The data type of images generated.
     * For regular color images, this should be `true`. For images with a high dynamic range,
     * or images that requires additional processing, this should be `false`.
     */
    is8bit?: boolean;
    /**
     * The custom function to test if a given extent is contained in this
     * source. Note: we assume this function accepts extents in this source's CRS.
     */
    containsFn?: CustomContainsFn;
    /**
     * The custom color space of the generated textures.
     * See https://threejs.org/docs/#manual/en/introduction/Color-management for
     * more information. If unspecified, the source considers that 8-bit images are in the sRGB
     * color space, otherwise `NoColorSpace`.
     */
    colorSpace?: ColorSpace;
}

export interface ImageSourceEvents {
    /**
     * Raised when the source's content has been updated.
     */
    updated: {
        /** empty */
    };
}

/**
 * Base class for all image sources. The `ImageSource` produces images to be consumed by clients,
 * such as map layers.
 */
abstract class ImageSource<Events extends ImageSourceEvents = ImageSourceEvents>
    extends EventDispatcher<Events & ImageSourceEvents>
    implements MemoryUsage
{
    readonly isImageSource: boolean = true;
    private readonly _customColorSpace: ColorSpace;
    type: string;
    /**
     * Gets whether images generated from this source should be flipped vertically.
     */
    readonly flipY: boolean;
    /**
     * Gets the datatype of images generated by this source.
     */
    datatype: TextureDataType;
    version: number;
    readonly containsFn: CustomContainsFn;

    /**
     * @param options - Options.
     */
    constructor(options: ImageSourceOptions = {}) {
        super();

        this.isImageSource = true;
        this.type = 'ImageSource';

        this.flipY = options.flipY ?? false;
        this.datatype = options.is8bit ?? true ? UnsignedByteType : FloatType;
        this._customColorSpace = options.colorSpace;

        this.version = 0;

        this.containsFn = options.containsFn;
    }

    getMemoryUsage(_context: GetMemoryUsageContext, target?: MemoryUsageReport): MemoryUsageReport {
        return target ?? createEmptyReport();
    }

    /**
     * Gets the color space of the textures generated by this source.
     */
    get colorSpace(): ColorSpace {
        if (this._customColorSpace) {
            return this._customColorSpace;
        }

        // Assume that 8-bit images are in the sRGB color space.
        // Also note that the final decision related to color space is the
        // responsibility of the layer rather than the source.
        return this.datatype === UnsignedByteType ? SRGBColorSpace : LinearSRGBColorSpace;
    }

    /**
     * Returns an adjusted extent, width and height so that request pixels are aligned with source
     * pixels, and requests do not oversample the source.
     *
     * @param requestExtent - The request extent.
     * @param requestWidth - The width, in pixels, of the request extent.
     * @param requestHeight - The height, in pixels, of the request extent.
     * @param margin - The margin, in pixels, around the initial extent.
     * @returns The adjusted parameters.
     */
    // eslint-disable-next-line class-methods-use-this
    adjustExtentAndPixelSize(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        requestExtent: Extent,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        requestWidth: number,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        requestHeight: number,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        margin = 0,
    ): { extent: Extent; width: number; height: number } | null {
        // Default implementation.
        return null;
    }

    /**
     * Returns the CRS of this source.
     *
     * @returns The CRS.
     */
    abstract getCrs(): string;

    /**
     * Returns the extent of this source expressed in the CRS of the source.
     *
     * @returns The extent of the source.
     */
    abstract getExtent(): Extent;

    /**
     * Raises an event to reload the source.
     */
    update() {
        this.dispatchEvent({ type: 'updated' });
    }

    /**
     * Gets whether this source contains the specified extent. If a custom contains function
     * is provided, it will be used. Otherwise,
     * {@link intersects} is used.
     *
     * This method is mainly used to discard non-relevant requests (i.e don't process regions
     * that are not relevant to this source).
     *
     * @param extent - The extent to test.
     */
    contains(extent: Extent) {
        const convertedExtent = extent.clone().as(this.getCrs());

        if (this.containsFn) {
            return this.containsFn(convertedExtent);
        }

        return this.intersects(convertedExtent);
    }

    /**
     * Test the intersection between the specified extent and this source's extent.
     * This method may be overriden to perform special logic.
     *
     * @param extent - The extent to test.
     * @returns `true` if the extent and this source extent intersects, `false` otherwise.
     */
    intersects(extent: Extent): boolean {
        const thisExtent = this.getExtent();
        if (thisExtent) {
            return thisExtent.intersectsExtent(extent);
        }
        // We don't have an extent, so we default to true.
        return true;
    }

    /**
     * Initializes the source.
     *
     * @param options - Options.
     * @returns A promise that resolves when the source is initialized.
     */
    // eslint-disable-next-line max-len
    // eslint-disable-next-line class-methods-use-this, no-unused-vars, @typescript-eslint/no-unused-vars
    initialize(options: {
        /** The target projection. Only useful for sources that are able
         * to reproject their data on the fly (typically vector sources). */
        targetProjection: string;
    }): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Gets the images for the specified extent and pixel size.
     *
     * @param options - The options.
     * @returns An array containing the functions to generate the images asynchronously.
     */
    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    abstract getImages(options: GetImageOptions): Array<ImageResponse>;

    /**
     * Disposes unmanaged resources of this source.
     */
    // eslint-disable-next-line class-methods-use-this
    dispose() {
        // Implement this in derived classes to cleanup unmanaged resources,
        // such as cached objects.
    }
}

export default ImageSource;

export { ImageResult };
