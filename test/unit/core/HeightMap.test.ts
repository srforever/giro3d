import HeightMap from 'src/core/HeightMap';
import OffsetScale from 'src/core/OffsetScale';
import {
    FloatType,
    RedFormat,
    RGBAFormat,
    RGFormat,
    UnsignedByteType,
    UnsignedShortType,
} from 'three';

const NO_OFFSET_SCALE = new OffsetScale(0, 0, 1, 1);

describe('HeightMap', () => {
    describe('constructor', () => {
        it('should assign properties', () => {
            const width = 112;
            const height = 234;
            const offsetScale = new OffsetScale(1, 2, 3, 4);
            const stride = 4;
            const buffer = new Uint16Array(width * height * stride);

            const heightmap = new HeightMap(
                buffer,
                width,
                height,
                offsetScale,
                RGBAFormat,
                UnsignedShortType,
            );

            expect(heightmap.buffer).toBe(buffer);
            expect(heightmap.width).toEqual(width);
            expect(heightmap.height).toEqual(height);
            expect(heightmap.stride).toEqual(stride);
            expect(heightmap.offsetScale).toEqual(offsetScale);
        });

        it('should throw if buffer is too small', () => {
            const width = 999;
            const height = 999;

            const buffer = new Float32Array(10);

            expect(
                () => new HeightMap(buffer, width, height, new OffsetScale(), RedFormat, FloatType),
            ).toThrowError(/buffer is too small/);
        });
    });

    describe('clone', () => {
        it('should reuse the same buffer', () => {
            const buffer = new Float32Array(200);
            const width = 10;
            const height = 10;
            const offsetScale = new OffsetScale(1, 2, 3, 4);
            const format = RGFormat;
            const type = FloatType;

            const original = new HeightMap(buffer, width, height, offsetScale, format, type);
            const clone = original.clone();

            expect(original.format).toEqual(clone.format);
            expect(original.width).toEqual(clone.width);
            expect(original.height).toEqual(clone.height);
            expect(original.stride).toEqual(clone.stride);
            expect(original.type).toEqual(clone.type);
            expect(original.offsetScale).toEqual(clone.offsetScale);

            expect(original.buffer).toBe(clone.buffer);
            expect(original.offsetScale).not.toBe(clone.offsetScale);
        });
    });

    describe('getValue', () => {
        it('[1x1 grid] should return the pixel value', () => {
            const buffer = new Uint16Array([56]);
            const heightmap = new HeightMap(
                buffer,
                1,
                1,
                NO_OFFSET_SCALE,
                RedFormat,
                UnsignedShortType,
            );

            expect(heightmap.getValue(0, 0)).toEqual(56);
            expect(heightmap.getValue(1, 0)).toEqual(56);
            expect(heightmap.getValue(1, 1)).toEqual(56);
            expect(heightmap.getValue(0, 1)).toEqual(56);
            expect(heightmap.getValue(0.5, 0.5)).toEqual(56);
        });

        it('[2x1 grid] should return the correct pixel value', () => {
            const buffer = new Uint16Array([56, 119]);
            const heightmap = new HeightMap(
                buffer,
                2,
                1,
                NO_OFFSET_SCALE,
                RedFormat,
                UnsignedShortType,
            );

            expect(heightmap.getValue(0, 0)).toEqual(56);
            expect(heightmap.getValue(1, 0)).toEqual(119);
            expect(heightmap.getValue(1, 1)).toEqual(119);
            expect(heightmap.getValue(0, 1)).toEqual(56);
            expect(heightmap.getValue(0.5, 0.5)).toEqual(56);
        });

        it('[1x1 grid] should correctly read RGBA encoded elevation', () => {
            const elevation = -4562.6;

            const precision = 0.01;
            const offset = 5000;

            // color.r * 1.0 / _precision + offset
            const value = (elevation + offset) / precision;
            const b = Math.floor(value / 256 / 256);
            const g = Math.floor((value - b * 256 * 256) / 256);
            const r = Math.floor(value - b * 256 * 256 - g * 256);

            const buffer = new Uint8ClampedArray([r, g, b, 1]);

            const heightmap = new HeightMap(
                buffer,
                1,
                1,
                NO_OFFSET_SCALE,
                RGBAFormat,
                UnsignedByteType,
                precision,
                offset,
            );

            expect(heightmap.getValue(0, 0)).toBeCloseTo(elevation, 1);
        });

        it('[1x1 grid] should honor ignoreTransparentPixels argument', () => {
            const HEIGHT = 123;
            const ALPHA = 0;
            const buffer = new Uint16Array([HEIGHT, ALPHA]);
            const heightmap = new HeightMap(
                buffer,
                1,
                1,
                NO_OFFSET_SCALE,
                RedFormat,
                UnsignedShortType,
            );

            expect(heightmap.getValue(0, 0)).toBeNull();
            expect(heightmap.getValue(0, 0, false)).toBeNull();
            expect(heightmap.getValue(0, 0, true)).toEqual(HEIGHT);
        });

        it('[2x2 grid] should return the correct pixel value', () => {
            const buffer = new Uint16Array([56, 119, 22, 3]);
            const heightmap = new HeightMap(
                buffer,
                2,
                2,
                NO_OFFSET_SCALE,
                RedFormat,
                UnsignedShortType,
            );

            expect(heightmap.getValue(0, 0)).toEqual(56);
            expect(heightmap.getValue(1, 0)).toEqual(119);
            expect(heightmap.getValue(1, 1)).toEqual(3);
            expect(heightmap.getValue(0, 1)).toEqual(22);
            expect(heightmap.getValue(0.5, 0.5)).toEqual(56);
        });

        it('should honor the channel count', () => {
            const IGNORE = 99;
            const buffer = new Uint16Array([56, IGNORE, 22, IGNORE]);
            const heightmap = new HeightMap(
                buffer,
                2,
                1,
                NO_OFFSET_SCALE,
                RGFormat,
                UnsignedShortType,
            );

            expect(heightmap.getValue(0, 0)).toEqual(56);
            expect(heightmap.getValue(1, 0)).toEqual(22);
            expect(heightmap.getValue(0.5, 0.5)).toEqual(56);
        });

        it('should honor offset/scale', () => {
            const cornerValue = 38;
            const buffer = new Uint16Array([cornerValue, 2, 3, 4]);

            const half = 1 / 2;
            const offsetScale = new OffsetScale(0, 0, half, half);
            const heightmap = new HeightMap(
                buffer,
                2,
                2,
                offsetScale,
                RedFormat,
                UnsignedShortType,
            );

            expect(heightmap.getValue(0, 0)).toEqual(cornerValue);
            expect(heightmap.getValue(1, 0)).toEqual(cornerValue);
            expect(heightmap.getValue(1, 1)).toEqual(cornerValue);
            expect(heightmap.getValue(0, 1)).toEqual(cornerValue);
            expect(heightmap.getValue(0.5, 0.5)).toEqual(cornerValue);
        });
    });
});
