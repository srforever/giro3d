import type { PixelFormat, TextureDataType, TypedArray } from 'three';
import { MathUtils, RGBAFormat, UnsignedByteType, Vector2 } from 'three';
import TextureGenerator from '../utils/TextureGenerator';
import type OffsetScale from './OffsetScale';

const RGBA_OFFSET = 20000;

const temp = {
    input: new Vector2(),
    output: new Vector2(),
};

/**
 * Utility class to sample an elevation raster.
 */
export default class HeightMap {
    /**
     * The heightmap data.
     */
    readonly buffer: TypedArray;
    /**
     * The width, in pixels, of the heightmap buffer.
     */
    readonly width: number;
    /**
     * The height, in pixels, of the heightmap buffer.
     */
    readonly height: number;
    /**
     * The transformation to apply to UV coordinates before sampling the buffer.
     */
    readonly offsetScale: OffsetScale;
    /**
     * The distance between each elevation value in the buffer.
     * e.g If the buffer is an RGBA buffer, stride is 4.
     */
    readonly stride: number;
    /**
     * The format of the underlying buffer pixels.
     */
    readonly format: PixelFormat;
    /**
     * The data type of the underlying buffer pixels.
     */
    readonly type: TextureDataType;

    constructor(
        buffer: TypedArray,
        width: number,
        height: number,
        offsetScale: OffsetScale,
        format: PixelFormat,
        type: TextureDataType,
    ) {
        const stride = TextureGenerator.getChannelCount(format);
        if (buffer.length < width * height * stride) {
            throw new Error('buffer is too small');
        }

        this.buffer = buffer;
        this.width = width;
        this.height = height;
        this.offsetScale = offsetScale;
        this.stride = stride;
        this.format = format;
        this.type = type;
    }

    private readRGBA(index: number, ignoreNoData: boolean): number | null {
        const { buffer, stride } = this;

        const r = buffer[index * stride + 0];
        const g = buffer[index * stride + 1];
        const b = buffer[index * stride + 2];
        const alpha = buffer[index * stride + 3];

        if (!ignoreNoData && alpha === 0) {
            return null;
        }

        return r + g * 256.0 + b * 256.0 * 256.0 - RGBA_OFFSET;
    }

    private readRG(index: number, ignoreNoData: boolean): number | null {
        const { buffer, stride } = this;

        const alpha = buffer[index * stride + 1];
        if (!ignoreNoData && alpha === 0) {
            return null;
        }

        const value = buffer[index * stride + 0];
        return value;
    }

    clone(): HeightMap {
        return new HeightMap(
            this.buffer,
            this.width,
            this.height,
            this.offsetScale.clone(),
            this.format,
            this.type,
        );
    }

    /**
     * Returns the elevation of the pixel that contains the UV coordinate.
     * No interpolation is performed.
     * @param u - The normalized U coordinate (along the horizontal axis).
     * @param v - The normalized V coordinate (along the vertical axis).
     * @param ignoreTransparentPixels - If `true`, then transparent pixels are returned. Otherwise
     * values that match transparent pixels return `null`. Default is `false`.
     */
    getValue(u: number, v: number, ignoreTransparentPixels = false): number | null {
        const { width, height, offsetScale } = this;

        temp.input.set(u, v);
        const transformed = offsetScale.transform(temp.input, temp.output);

        const uu = MathUtils.clamp(transformed.x, 0, 1);
        const vv = MathUtils.clamp(transformed.y, 0, 1);

        const i = MathUtils.clamp(Math.round(uu * width - 1), 0, width);
        const j = MathUtils.clamp(Math.round(vv * height - 1), 0, height);

        const index = i + j * width;

        if (this.format === RGBAFormat && this.type === UnsignedByteType) {
            return this.readRGBA(index, ignoreTransparentPixels);
        } else {
            return this.readRG(index, ignoreTransparentPixels);
        }
    }
}
