// Number.isNan is quite slow, so we use n !== n
/* eslint-disable no-self-compare */
import {
    Texture,
    DataTexture,
    FloatType,
    AlphaFormat,
    LuminanceAlphaFormat,
    LuminanceFormat,
    HalfFloatType,
    DepthFormat,
    RedFormat,
    RedIntegerFormat,
    RGFormat,
    DepthStencilFormat,
    RGIntegerFormat,
    RGBAIntegerFormat,
    RGBAFormat,
    UnsignedByteType,
    ShortType,
    UnsignedShortType,
    IntType,
    ByteType,
    UnsignedShort4444Type,
    UnsignedInt248Type,
    UnsignedIntType,
    UnsignedShort5551Type,
    ClampToEdgeWrapping,
    LinearFilter,
    MathUtils,
    type WebGLRenderTarget,
    type AnyPixelFormat,
    type TextureDataType,
    type WebGLRenderer,
    type Color,
    type PixelFormat,
    type CanvasTexture,
    type TypedArray,
} from 'three';
import Interpretation, { Mode } from '../core/layer/Interpretation';

export const OPAQUE_BYTE = 255;
export const OPAQUE_FLOAT = 1.0;
export const TRANSPARENT = 0;
export const DEFAULT_NODATA = 0;

export type NumberArray =
    Array<number>
    | Uint8ClampedArray
    | Uint8Array
    | Int8Array
    | Uint16Array
    | Int16Array
    | Uint32Array
    | Int32Array
    | Float32Array
    | Float64Array;

function isDataTexture(texture: Texture): texture is DataTexture {
    return (texture as DataTexture).isDataTexture;
}

function isCanvasTexture(texture: Texture): texture is CanvasTexture {
    return (texture as CanvasTexture).isCanvasTexture;
}

/**
 * Returns the number of bytes per channel.
 *
 * @param dataType - The pixel format.
 * @returns The number of bytes per channel.
 */
function getBytesPerChannel(dataType: TextureDataType): number {
    switch (dataType) {
        case UnsignedByteType:
        case ByteType:
            return 1;
        case ShortType:
        case UnsignedShortType:
        case UnsignedShort4444Type:
        case UnsignedShort5551Type:
            return 2;
        case IntType:
        case UnsignedIntType:
        case UnsignedInt248Type:
        case FloatType:
            return 4;
        case HalfFloatType:
            return 2;
        default:
            throw new Error(`unknown data type: ${dataType}`);
    }
}

function getDataTypeString(dataType: TextureDataType): string {
    switch (dataType) {
        case UnsignedByteType: return 'UnsignedByteType';
        case ByteType: return 'ByteType';
        case ShortType: return 'ShortType';
        case UnsignedShortType: return 'UnsignedShortType';
        case UnsignedShort4444Type: return 'UnsignedShort4444Type';
        case UnsignedShort5551Type: return 'UnsignedShort5551Type';
        case IntType: return 'IntType';
        case UnsignedIntType: return 'UnsignedIntType';
        case UnsignedInt248Type: return 'UnsignedInt248Type';
        case FloatType: return 'FloatType';
        case HalfFloatType: return 'HalfFloatType';
        default:
            throw new Error(`unknown data type: ${dataType}`);
    }
}

// Important note : a lot of code is duplicated to avoid putting
// conditional branches inside loops, as this can severely reduce performance.

// Note: we don't use Number.isNan(x) in the loops as it slows down the loop due to function
// invocation. Instead, we use x !== x, as a NaN is never equal to itself.
function fillBuffer<T extends NumberArray>(
    buf: T, options: {
        scaling?: { min: number, max: number },
        nodata?: number
    },
    opaqueValue: number,
    ...pixelData: NumberArray[]
): T {
    let getValue: (arg0: number) => number;

    if (options.scaling) {
        const { min, max } = options.scaling;
        getValue = x => Math.floor(MathUtils.mapLinear(x, min, max, 0, 255));
    } else {
        getValue = x => x;
    }

    if (pixelData.length === 1) {
        const v = pixelData[0];
        const length = v.length;
        for (let i = 0; i < length; i++) {
            const idx = i * 2;
            let value;
            let a;
            const raw = v[i];
            if (raw !== raw || raw === options.nodata) {
                value = DEFAULT_NODATA;
                a = TRANSPARENT;
            } else {
                value = getValue(raw);
                a = opaqueValue;
            }
            buf[idx + 0] = value;
            buf[idx + 1] = a;
        }
    }
    if (pixelData.length === 2) {
        const v = pixelData[0];
        const a = pixelData[1];
        const length = v.length;
        for (let i = 0; i < length; i++) {
            const idx = i * 2;
            let value;
            const raw = v[i];
            if (raw !== raw || raw === options.nodata) {
                value = DEFAULT_NODATA;
            } else {
                value = getValue(raw);
            }
            buf[idx + 0] = value;
            buf[idx + 1] = a[i];
        }
    }
    if (pixelData.length === 3) {
        const rChannel = pixelData[0];
        const gChannel = pixelData[1];
        const bChannel = pixelData[2];
        const length = rChannel.length;
        let a;
        for (let i = 0; i < length; i++) {
            const idx = i * 4;

            let r = rChannel[i];
            let g = gChannel[i];
            let b = bChannel[i];

            if ((r !== r || r === options.nodata)
                && (g !== g || g === options.nodata)
                && (b !== b || b === options.nodata)) {
                r = DEFAULT_NODATA;
                g = DEFAULT_NODATA;
                b = DEFAULT_NODATA;
                a = TRANSPARENT;
            } else {
                r = getValue(r);
                g = getValue(g);
                b = getValue(b);
                a = opaqueValue;
            }

            buf[idx + 0] = r;
            buf[idx + 1] = g;
            buf[idx + 2] = b;
            buf[idx + 3] = a;
        }
    }
    if (pixelData.length === 4) {
        const rChannel = pixelData[0];
        const gChannel = pixelData[1];
        const bChannel = pixelData[2];
        const aChannel = pixelData[3];
        const length = rChannel.length;
        for (let i = 0; i < length; i++) {
            const idx = i * 4;
            let r = rChannel[i];
            let g = gChannel[i];
            let b = bChannel[i];
            let a = aChannel[i];

            if ((r !== r || r === options.nodata)
                && (g !== g || g === options.nodata)
                && (b !== b || b === options.nodata)) {
                r = DEFAULT_NODATA;
                g = DEFAULT_NODATA;
                b = DEFAULT_NODATA;
                a = TRANSPARENT;
            } else {
                r = getValue(r);
                g = getValue(g);
                b = getValue(b);
            }

            buf[idx + 0] = r;
            buf[idx + 1] = g;
            buf[idx + 2] = b;
            buf[idx + 3] = a;
        }
    }
    return buf;
}

/**
 * Returns the number of channels per pixel.
 *
 * @param pixelFormat - The pixel format.
 * @returns The number of channels per pixel.
 */
function getChannelCount(pixelFormat: AnyPixelFormat): number {
    switch (pixelFormat) {
        case AlphaFormat: return 1;
        case RGBAFormat: return 4;
        case LuminanceFormat: return 1;
        case LuminanceAlphaFormat: return 2;
        case DepthFormat: return 1;
        case DepthStencilFormat: return 1;
        case RedFormat: return 1;
        case RedIntegerFormat: return 1;
        case RGFormat: return 2;
        case RGIntegerFormat: return 2;
        case RGBAIntegerFormat: return 4;
        default:
            throw new Error(`invalid pixel format: ${pixelFormat}`);
    }
}

/**
 * Estimate the size of the texture.
 *
 * @param texture - The texture.
 * @returns The size, in bytes.
 */
function estimateSize(texture: Texture): number {
    // Note: this estimation is very broad for several reasons
    // - It does not know if this texture is GPU-memory only or if there is a copy in CPU-memory
    // - It does not know any possible optimization done by the GPU
    const channels = getChannelCount(texture.format);
    const bpp = getBytesPerChannel(texture.type);

    return texture.image.width * texture.image.height * channels * bpp;
}

/**
 * Reads back the render target buffer into CPU memory, then attach this buffer to the `data`
 * property of the render target's texture.
 *
 * This is useful because normally the pixels of a render target are not readable.
 *
 * @param target - The render target to read back.
 * @param renderer - The WebGL renderer to perform the operation.
 */
function createDataCopy(target: WebGLRenderTarget, renderer: WebGLRenderer) {
    // Render target textures don't have data in CPU memory,
    // we need to transfer their data into a buffer.
    const bufSize = target.width * target.height * getChannelCount(target.texture.format);
    const buf = target.texture.type === UnsignedByteType
        ? new Uint8Array(bufSize)
        : new Float32Array(bufSize);
    renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, buf);
    (target.texture as Texture & { data: TypedArray }).data = buf;
}

/**
 * Gets the underlying pixel buffer of the image.
 *
 * @param image - The image.
 * @returns The pixel buffer.
 */
function getPixels(image: ImageBitmap | HTMLImageElement | HTMLCanvasElement): Uint8ClampedArray {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);

    return context.getImageData(0, 0, image.width, image.height).data;
}

/**
 * Decodes the blob according to its media type, then returns a texture for this blob.
 *
 * @param blob - The buffer to decode.
 * @param options - Options
 * @returns The generated texture.
 * @throws When the media type is unsupported.
 */
async function decodeBlob(
    blob: Blob, options: {
        /** If true, the texture will be a data texture. */
        createDataTexture?: boolean;
    } = {},
): Promise<Texture> {
    // media types are in the form 'type;args', for example: 'text/html; charset=UTF-8;
    const [type] = blob.type.split(';');

    switch (type) {
        case 'image/webp':
        case 'image/png':
        case 'image/jpg': // not a valid media type, but we support it for compatibility
        case 'image/jpeg': {
            // Use the browser capabilities to decode the image
            const img = await createImageBitmap(blob);
            let tex;
            if (options.createDataTexture) {
                const buf = getPixels(img);
                tex = new DataTexture(buf, img.width, img.height, RGBAFormat, UnsignedByteType);
            } else {
                tex = new Texture(img);
            }
            tex.wrapS = ClampToEdgeWrapping;
            tex.wrapT = ClampToEdgeWrapping;
            tex.minFilter = LinearFilter;
            tex.magFilter = LinearFilter;
            tex.generateMipmaps = false;
            tex.needsUpdate = true;
            return tex;
        }
        default:
            throw new Error(`unsupported media type for textures: ${blob.type}`);
    }
}

/**
 * Returns a {@link DataTexture} initialized with the specified data.
 *
 * @param options - The creation options.
 * @param sourceDataType - The data type of the input pixel data.
 * @param pixelData - The pixel data
 * for each input channels. Must be either one, three, or four channels.
 */
function createDataTexture(
    options: {
        /** The texture width */
        width?: number;
        /** The texture height */
        height?: number;
        /**
         * Indicates that the input data must be scaled into 8-bit values,
         * using the provided min and max values for scaling.
         */
        scaling?: { min: number; max: number; };
        /**
         * The no-data value. If specified, if a pixel has this value,
         * then the alpha value will be transparent. Otherwise it will be opaque.
         * If unspecified, the alpha will be opaque. This only applies to 1-channel data.
         * Ignored for 3 and 4-channel data.
         */
        nodata?: number;
    },
    sourceDataType: TextureDataType,
    ...pixelData: NumberArray[]
) {
    const width = options.width;
    const height = options.height;
    const pixelCount = width * height;

    // If we apply scaling, it means that we force a 8-bit output.
    const targetDataType = options.scaling === undefined
        ? sourceDataType
        : UnsignedByteType;

    let result;

    let format: PixelFormat;
    let channelCount: number;
    switch (pixelData.length) {
        case 1:
        case 2:
            format = RGFormat;
            channelCount = 2;
            break;
        default:
            format = RGBAFormat;
            channelCount = 4;
            break;
    }

    switch (targetDataType) {
        case UnsignedByteType:
        {
            const buf = new Uint8ClampedArray(pixelCount * channelCount);
            const data = fillBuffer(
                buf,
                { scaling: options.scaling, nodata: options.nodata },
                OPAQUE_BYTE,
                ...pixelData,
            );

            result = new DataTexture(data, width, height, format, UnsignedByteType);
            break;
        }
        case FloatType:
        {
            const buf = new Float32Array(pixelCount * channelCount);
            const data = fillBuffer(buf, options, OPAQUE_FLOAT, ...pixelData);
            result = new DataTexture(data, width, height, format, FloatType);
            break;
        }
        default:
            throw new Error('unsupported data type');
    }

    result.needsUpdate = true;
    return result;
}

/**
 * Returns a 1D texture containing a pixel on the horizontal axis for each color in the array.
 *
 * @param colors - The color gradient.
 * @returns The resulting texture.
 */
function create1DTexture(colors: Color[]): DataTexture {
    const size = colors.length;
    const buf = new Uint8ClampedArray(size * 4);

    for (let i = 0; i < size; i++) {
        const color = colors[i];
        const index = i * 4;

        buf[index + 0] = color.r * 255;
        buf[index + 1] = color.g * 255;
        buf[index + 2] = color.b * 255;
        buf[index + 3] = 255;
    }

    const HEIGHT = 1;
    const texture = new DataTexture(buf, size, HEIGHT, RGBAFormat, UnsignedByteType);
    texture.needsUpdate = true;

    return texture;
}

/**
 * Computes the minimum and maximum value of the buffer, but only taking into account the first
 * channel (R channel). This is typically used for elevation data.
 *
 * @param buffer - The pixel buffer. May be an RGBA or an RG buffer.
 * @param nodata - The no-data value. Pixels with this value will be ignored.
 * @param interpretation - The image interpretation.
 * @param channelCount - The channel count of the buffer
 * @returns The computed min/max.
 */
function computeMinMaxFromBuffer(
    buffer: NumberArray,
    nodata?: number,
    interpretation: Interpretation = Interpretation.Raw,
    channelCount = 4,
): { min: number; max: number; } {
    let min = Infinity;
    let max = -Infinity;

    const RED_CHANNEL = 0;
    const GREEN_CHANNEL = 1;
    const BLUE_CHANNEL = 2;
    const alphaChannel = channelCount - 1;

    switch (interpretation.mode) {
        case Mode.Raw:
            for (let i = 0; i < buffer.length; i += channelCount) {
                const value = buffer[i + RED_CHANNEL];
                const alpha = buffer[i + alphaChannel];
                if (!(value !== value) && value !== nodata && alpha !== 0) {
                    min = Math.min(min, value);
                    max = Math.max(max, value);
                }
            }
            break;
        case Mode.ScaleToMinMax:
            {
                const lower = interpretation.min;
                const upper = interpretation.max;
                const scale = upper - lower;

                for (let i = 0; i < buffer.length; i += channelCount) {
                    const value = buffer[i + RED_CHANNEL] / 255;
                    const r = lower + value * scale;
                    const alpha = buffer[i + alphaChannel];

                    if (!(r !== r) && r !== nodata && alpha !== 0) {
                        min = Math.min(min, r);
                        max = Math.max(max, r);
                    }
                }
            }
            break;
        case Mode.MapboxTerrainRGB:
            for (let i = 0; i < buffer.length; i += 4) {
                const r = buffer[i + RED_CHANNEL];
                const g = buffer[i + GREEN_CHANNEL];
                const b = buffer[i + BLUE_CHANNEL];
                const alpha = buffer[i + alphaChannel];

                const value = -10000.0 + (r * 256.0 * 256.0 + g * 256.0 + b) * 0.1;

                if (!(value !== value) && value !== nodata && alpha !== 0) {
                    min = Math.min(min, value);
                    max = Math.max(max, value);
                }
            }
            break;
        default:
            throw new Error('not implemented');
    }

    if (interpretation.negateValues) {
        return { min: -max, max: -min };
    }
    return { min, max };
}

function getWiderType(left: TextureDataType, right: TextureDataType): TextureDataType {
    if (getBytesPerChannel(left) > getBytesPerChannel(right)) {
        return left;
    }

    return right;
}

function shouldExpandRGB(src: PixelFormat, dst: PixelFormat): boolean {
    if (dst !== RGBAFormat) {
        return false;
    }
    if (src === dst) {
        return false;
    }
    return true;
}

/**
 * Computes min/max of the given image.
 *
 * @param image - The image to process.
 * @param interpretation - The interpretation of the image.
 * @returns The min/max.
 */
function computeMinMaxFromImage(
    image: HTMLImageElement | HTMLCanvasElement,
    interpretation: Interpretation = Interpretation.Raw,
): { min: number; max: number; } {
    const buf = getPixels(image);

    return computeMinMaxFromBuffer(buf, 0, interpretation);
}

function computeMinMax(
    texture: Texture,
    noDataValue = 0,
    interpretation = Interpretation.Raw,
): { min: number; max: number } | null {
    if (isDataTexture(texture)) {
        const channelCount = getChannelCount(texture.format);
        return computeMinMaxFromBuffer(
            texture.image.data,
            noDataValue,
            interpretation,
            channelCount,
        );
    }
    if (isCanvasTexture(texture)) {
        return computeMinMaxFromImage(texture.image, interpretation);
    }

    return null;
}

export default {
    createDataTexture,
    decodeBlob,
    fillBuffer,
    getChannelCount,
    getBytesPerChannel,
    getWiderType,
    getDataTypeString,
    create1DTexture,
    createDataCopy,
    computeMinMax,
    isDataTexture,
    isCanvasTexture,
    computeMinMaxFromBuffer,
    computeMinMaxFromImage,
    estimateSize,
    shouldExpandRGB,
};
