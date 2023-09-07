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
    CanvasTexture,
} from 'three';
import Interpretation, { Mode } from '../core/layer/Interpretation';

export const OPAQUE_BYTE = 255;
export const OPAQUE_FLOAT = 1.0;
export const TRANSPARENT = 0;
export const DEFAULT_NODATA = 0;

// Important note : a lot of code is duplicated to avoid putting
// conditional branches inside loops, as this can severely reduce performance.

function fillBuffer(buf, options, opaqueValue, ...pixelData) {
    let getValue;

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
            const idx = i * 4;
            let value;
            let a;
            const raw = v[i];
            if (Number.isNaN(raw) || raw === options.nodata) {
                value = DEFAULT_NODATA;
                a = TRANSPARENT;
            } else {
                value = getValue(raw);
                a = opaqueValue;
            }
            buf[idx + 0] = value;
            buf[idx + 1] = value;
            buf[idx + 2] = value;
            buf[idx + 3] = a;
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

            if ((Number.isNaN(r) || r === options.nodata)
                && (Number.isNaN(g) || g === options.nodata)
                && (Number.isNaN(b) || b === options.nodata)) {
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

            if ((Number.isNaN(r) || r === options.nodata)
                && (Number.isNaN(g) || g === options.nodata)
                && (Number.isNaN(b) || b === options.nodata)) {
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
 * Loads the specified image with a blob.
 *
 * @param {HTMLImageElement} img The image to load.
 * @param {Blob} blob The data blob containing the encoded image data (PNG, JPEG, etc.).
 * @returns {Promise<HTMLImageElement>} A Promise that resolves when the image is loaded, or rejects
 * when any error occurs during the loading process.
 */
function load8bitImage(img, blob) {
    // Note: the reason why we don't create the image element inside this function is
    // to prevent it from being eliminated by an aggressive garbage collector, and thus
    // creating a promise that never finished.
    return new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = reject;
        const objUrl = URL.createObjectURL(blob);
        img.src = objUrl;
    });
}

/**
 * Returns the number of channels per pixel.
 *
 * @param {"PixelFormat"} pixelFormat The pixel format.
 * @returns {number} The number of channels per pixel.
 */
function getChannelCount(pixelFormat) {
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
 * @param {Texture} texture The texture.
 * @returns {number} The size, in bytes.
 */
function estimateSize(texture) {
    // Note: this estimation is very broad for several reasons
    // - It does not know if this texture is GPU-memory only or if there is a copy in CPU-memory
    // - It does not know any possible optimization done by the GPU
    const channels = getChannelCount(texture.format);
    const bpp = getBytesPerChannel(texture.type);

    return texture.image.width * texture.image.height * channels * bpp;
}

/**
 * Returns the number of bytes per channel.
 *
 * @param {"TextureDataType"} dataType The pixel format.
 * @returns {number} The number of bytes per channel.
 */
function getBytesPerChannel(dataType) {
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

/**
 * Reads back the render target buffer into CPU memory, then attach this buffer to the `data`
 * property of the render target's texture.
 *
 * This is useful because normally the pixels of a render target are not readable.
 *
 * @param {"WebGLRenderTarget"} target The render target to read back.
 * @param {"WebGLRenderer"} renderer The WebGL renderer to perform the operation.
 */
function createDataCopy(target, renderer) {
    // Render target textures don't have data in CPU memory,
    // we need to transfer their data into a buffer.
    const bufSize = target.width * target.height * getChannelCount(target.texture.format);
    const buf = target.texture.type === UnsignedByteType
        ? new Uint8Array(bufSize)
        : new Float32Array(bufSize);
    renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, buf);
    target.texture.data = buf;
}

/**
 * Gets the underlying pixel buffer of the image.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} image The image.
 * @returns {Uint8ClampedArray} The pixel buffer.
 */
function getPixels(image) {
    const canvas = document.createElement('canvas', { width: image.width, height: image.height });
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);

    return context.getImageData(0, 0, image.width, image.height).data;
}

/**
 * Computes min/max of the given image.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} image The image to process.
 * @param {Interpretation} [interpretation] The interpretation of the image.
 * @returns {{ min: number, max: number }} The min/max.
 */
function computeMinMaxFromImage(image, interpretation = Interpretation.Raw) {
    const buf = getPixels(image);

    return computeMinMax(buf, 0, interpretation);
}

/**
 * Decodes the blob according to its media type, then returns a texture for this blob.
 *
 * @param {Blob} blob The buffer to decode.
 * @param {object} options Options
 * @param {boolean} options.createDataTexture If true, the texture will be a data texture.
 * @returns {Promise<Texture>} The generated texture.
 * @throws {Error} When the media type is unsupported.
 * @memberof TextureGenerator
 */
async function decodeBlob(blob, options = {}) {
    // media types are in the form 'type;args', for example: 'text/html; charset=UTF-8;
    const [type] = blob.type.split(';');

    switch (type) {
        case 'image/webp':
        case 'image/png':
        case 'image/jpg': // not a valid media type, but we support it for compatibility
        case 'image/jpeg': {
            // Use the browser capabilities to decode the image
            const img = new Image();
            await load8bitImage(img, blob);
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
 * Returns a @type {DataTexture} initialized with the specified data.
 *
 * @static
 * @param {object} options The creation options.
 * @param {number} [options.width] width The texture width.
 * @param {number} [options.height] height The texture height.
 * @param {object} [options.scaling=undefined] Indicates that the input data must be scaled
 * into 8-bit values, using the provided min and max values for scaling.
 * @param {number} [options.scaling.min] The minimum value the input data, used to compute
 * the scaling parameters.
 * @param {number} [options.scaling.max] The maximum value of the input data, used to compute
 * the scaling parameters.
 * @param {number} [options.nodata=undefined] The no-data value. If specified,
 * if a pixel has this value, then the alpha value will be transparent.
 * Otherwise it will be opaque. If unspecified, the alpha will be opaque. This only applies to
 * 1-channel data. Ignored for 3 and 4-channel data.
 * @param {FloatType|UnsignedByteType} sourceDataType The data type of the input pixel data.
 * @param {...Array<number>| Uint8Array | Int8Array | Uint16Array
 * | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array} pixelData The pixel data
 * for each input channels. Must be either one, three, or four channels.
 * @memberof TextureGenerator
 */
function createDataTexture(options, sourceDataType, ...pixelData) {
    const width = options.width;
    const height = options.height;
    const pixelCount = width * height;
    const channelCount = 4; // For now, we force RGBA

    // If we apply scaling, it means that we force a 8-bit output.
    const targetDataType = options.scaling === undefined
        ? sourceDataType
        : UnsignedByteType;

    let result;

    switch (targetDataType) {
        case UnsignedByteType:
        {
            const buf = new Uint8ClampedArray(pixelCount * channelCount);
            const data = fillBuffer(buf, options, OPAQUE_BYTE, ...pixelData);
            // We use an ImageData proxy to support drawing this image into a canvas.
            // This is only possible for 8-bit images.
            const img = new ImageData(data, width, height);
            result = new DataTexture(img, width, height, RGBAFormat, UnsignedByteType);
            break;
        }
        case FloatType:
        {
            const buf = new Float32Array(pixelCount * channelCount);
            const data = fillBuffer(buf, options, OPAQUE_FLOAT, ...pixelData);
            result = new DataTexture(data, width, height, RGBAFormat, FloatType);
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
 * @param {"Color"[]} colors The color gradient.
 * @returns {DataTexture} The resulting texture.
 */
function create1DTexture(colors) {
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
 * Computes the minimum and maximum value of the RGBA buffer, but only taking into account the first
 * channel (R channel). This is typically used for elevation data.
 *
 * @param {ArrayBuffer} rgba The RGBA buffer.
 * @param {?number} nodata The no-data value. Pixels with this value will be ignored.
 * @param {Interpretation} interpretation The image interpretation.
 * @returns {{min: number, max: number}} The computed min/max.
 */
function computeMinMax(rgba, nodata, interpretation = Interpretation.Raw) {
    let min = Infinity;
    let max = -Infinity;

    const RED_CHANNEL = 0;
    const GREEN_CHANNEL = 1;
    const BLUE_CHANNEL = 2;
    const ALPHA_CHANNEL = 3;

    switch (interpretation.mode) {
        case Mode.Raw:
            for (let i = 0; i < rgba.length; i += 4) {
                const value = rgba[i + RED_CHANNEL];
                const alpha = rgba[i + ALPHA_CHANNEL];
                if (!Number.isNaN(value) && value !== nodata && alpha !== 0) {
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

                for (let i = 0; i < rgba.length; i += 4) {
                    const value = rgba[i + RED_CHANNEL] / 255;
                    const r = lower + value * scale;
                    const alpha = rgba[i + ALPHA_CHANNEL];

                    if (!Number.isNaN(r) && r !== nodata && alpha !== 0) {
                        min = Math.min(min, r);
                        max = Math.max(max, r);
                    }
                }
            }
            break;
        case Mode.MapboxTerrainRGB:
            for (let i = 0; i < rgba.length; i += 4) {
                const r = rgba[i + RED_CHANNEL];
                const g = rgba[i + GREEN_CHANNEL];
                const b = rgba[i + BLUE_CHANNEL];
                const alpha = rgba[i + ALPHA_CHANNEL];

                const value = -10000.0 + (r * 256.0 * 256.0 + g * 256.0 + b) * 0.1;

                if (!Number.isNaN(value) && value !== nodata && alpha !== 0) {
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

export default {
    createDataTexture,
    decodeBlob,
    fillBuffer,
    getChannelCount,
    getBytesPerChannel,
    create1DTexture,
    createDataCopy,
    computeMinMax,
    estimateSize,
    computeMinMaxFromImage,
};
