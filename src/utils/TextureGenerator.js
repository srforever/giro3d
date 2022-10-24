import {
    DataTexture, FloatType, RGBAFormat, UnsignedByteType,
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
            const nodata = options.nodata;
            const v = pixelData[0];
            const length = v.length;
            for (let i = 0; i < length; i++) {
                const idx = i * 4;
                const raw = v[i];
                // and handle no data values
                let value;
                let a;
                if (Number.isNaN(raw)) {
                    value = options.nodata;
                    a = TRANSPARENT;
                } else if (raw === nodata) {
                    value = getValue(raw);
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

/**
 * Returns a {@type DataTexture} initialized with the specified data.
 *
 * @static
 * @param {number} width The texture width.
 * @param {number} height The texture height.
 * @param {object} options The creation options.
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
function createDataTexture(width, height, options, sourceDataType, ...pixelData) {
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

export default createDataTexture;
