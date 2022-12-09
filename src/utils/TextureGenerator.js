import {
    Texture,
    DataTexture,
    FloatType,
    PixelFormat,
    AlphaFormat,
    LuminanceAlphaFormat,
    LuminanceFormat,
    RGBFormat,
    DepthFormat,
    RedFormat,
    RedIntegerFormat,
    RGFormat,
    DepthStencilFormat,
    RGIntegerFormat,
    RGBAIntegerFormat,
    RGBAFormat,
    UnsignedByteType,
    WebGLRenderTarget,
    WebGLRenderer,
} from 'three';

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
        const factor = 255 / (max - min);
        getValue = x => Math.round((x - min) * factor);
    } else {
        getValue = x => x;
    }

    if (pixelData.length === 1) {
        // We simply triplicate the value into the RGB channels,
        if (options.nodata !== undefined) {
            let emptyLines = 0;
            const v = pixelData[0];
            const nodata = options.nodata;
            const width = options.width;
            const height = options.height;
            for (let h = 0; h < height; h++) {
                const hw = h * width;
                let a;
                let value;
                let fillRight;
                for (let w = 0; w < width; w++) {
                    const i = hw + w;
                    const raw = v[i];
                    const idx = i * 4;
                    if (Number.isNaN(raw) || raw === nodata) {
                        if (fillRight === undefined) {
                            value = undefined;
                        } else {
                            value = fillRight;
                        }
                        a = TRANSPARENT;
                    } else {
                        value = getValue(raw);
                        if (fillRight === undefined) {
                            for (let j = idx - 4; j >= hw * 4; j -= 4) {
                                buf[j + 0] = value;
                                buf[j + 1] = value;
                                buf[j + 2] = value;
                            }
                        }
                        fillRight = value;
                        a = opaqueValue;
                    }
                    buf[idx + 0] = value;
                    buf[idx + 1] = value;
                    buf[idx + 2] = value;
                    buf[idx + 3] = a;
                }
                if (fillRight === undefined && value === undefined) {
                    emptyLines++;
                }
            }
            if (emptyLines > 0) {
                for (let w = 0; w < width; w++) {
                    let fillAbove;
                    for (let h = 0; h < height; h++) {
                        const i = h * width + w;
                        const idx = i * 4;
                        const raw = buf[idx];
                        if (!Number.isNaN(raw)) {
                            if (fillAbove === undefined) {
                                for (let j = h; j >= 0; j--) {
                                    const jdx = (j * width + w) * 4;
                                    buf[jdx + 0] = raw;
                                    buf[jdx + 1] = raw;
                                    buf[jdx + 2] = raw;
                                }
                            }
                            fillAbove = raw;
                        } else {
                            buf[idx + 0] = fillAbove;
                            buf[idx + 1] = fillAbove;
                            buf[idx + 2] = fillAbove;
                        }
                    }
                }
            }
        } else {
            const v = pixelData[0];
            const length = v.length;
            for (let i = 0; i < length; i++) {
                const idx = i * 4;
                let value;
                let a;
                const raw = v[i];
                if (Number.isNaN(raw)) {
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
    }
    if (pixelData.length === 3) {
        const r = pixelData[0];
        const g = pixelData[1];
        const b = pixelData[2];
        const length = r.length;
        for (let i = 0; i < length; i++) {
            const idx = i * 4;
            buf[idx + 0] = getValue(r[i]);
            buf[idx + 1] = getValue(g[i]);
            buf[idx + 2] = getValue(b[i]);
            buf[idx + 3] = opaqueValue;
        }
    }
    if (pixelData.length === 4) {
        const r = pixelData[0];
        const g = pixelData[1];
        const b = pixelData[2];
        const a = pixelData[3];
        const length = r.length;
        for (let i = 0; i < length; i++) {
            const idx = i * 4;
            buf[idx + 0] = getValue(r[i]);
            buf[idx + 1] = getValue(g[i]);
            buf[idx + 2] = getValue(b[i]);
            buf[idx + 3] = getValue(a[i]);
        }
    }
    return buf;
}

function create8bitImage(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        const objUrl = URL.createObjectURL(blob);
        img.src = objUrl;
    });
}

/**
 * Returns the number of channels per pixel.
 *
 * @param {PixelFormat} pixelFormat The pixel format.
 * @returns {number} The number of channels per pixel.
 */
function getChannelCount(pixelFormat) {
    switch (pixelFormat) {
        case AlphaFormat: return 1;
        case RGBFormat: return 3;
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
 * Reads back the render target buffer into CPU memory, then attach this buffer to the `data`
 * property of the render target's texture.
 *
 * This is useful because normally the pixels of a render target are not readable.
 *
 * @param {WebGLRenderTarget} target The render target to read back.
 * @param {WebGLRenderer} renderer The WebGL renderer to perform the operation.
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
 * Decodes the blob according to its media type, then returns a texture for this blob.
 *
 * @param {Blob} blob The buffer to decode.
 * @returns {Promise<Texture>} The generated texture.
 * @throws {Error} When the media type is unsupported.
 * @memberof TextureGenerator
 */
async function decodeBlob(blob) {
    // media types are in the form 'type;args', for example: 'text/html; charset=UTF-8;
    const [type] = blob.type.split(';');

    switch (type) {
        case 'image/webp':
        case 'image/png':
        case 'image/jpg': // not a valid media type, but we support it for compatibility
        case 'image/jpeg': {
            // Use the browser capabilities to decode the image
            const img = await create8bitImage(blob);
            return new Texture(img);
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
 * @param {object} [options.width] width The texture width.
 * @param {object} [options.height] height The texture height.
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
 * @param {...Array} pixelData The pixel data for each input channels.
 * Must be either one, three, or four channels.
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

    switch (targetDataType) {
        case UnsignedByteType:
        {
            const buf = new Uint8ClampedArray(pixelCount * channelCount);
            const data = fillBuffer(buf, options, OPAQUE_BYTE, ...pixelData);
            // We use an ImageData proxy to support drawing this image into a canvas.
            // This is only possible for 8-bit images.
            const img = new ImageData(data, width, height);
            return new DataTexture(img, width, height, RGBAFormat, UnsignedByteType);
        }
        case FloatType:
        {
            const buf = new Float32Array(pixelCount * channelCount);
            const data = fillBuffer(buf, options, OPAQUE_FLOAT, ...pixelData);
            return new DataTexture(data, width, height, RGBAFormat, FloatType);
        }
        default:
            throw new Error('unsupported data type');
    }
}

export default {
    createDataTexture,
    decodeBlob,
    fillBuffer,
    createDataCopy,
};
