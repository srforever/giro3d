import {
    CanvasTexture,
    Color,
    DataTexture,
    FloatType,
    MathUtils,
    RGBAFormat,
    RGFormat,
    Texture,
    UnsignedByteType,
} from 'three';
import TextureGenerator, {
    OPAQUE_BYTE,
    OPAQUE_FLOAT,
    TRANSPARENT,
    DEFAULT_NODATA,
} from 'src/utils/TextureGenerator';
import Interpretation from 'src/core/layer/Interpretation';

describe('TextureGenerator', () => {
    describe('createDataTexture', () => {
        describe('given unsigned 8-bit data', () => {
            describe('given 1 input channel', () => {
                it('should return a buffer with N * 4 values, where N is the number of pixels', () => {
                    const data = new Uint8ClampedArray([5, 4, 3, 2]);
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = data.length * 2; // RGBA

                    const result = TextureGenerator.createDataTexture({
                        width: w,
                        height: h,
                        outputType: UnsignedByteType,
                        pixelData: [data],
                    });

                    const buf = result.texture.image.data;

                    expect(result.texture).toBeInstanceOf(DataTexture);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < data.length; i++) {
                        const v = data[i];
                        const idx = i * 2;
                        expect(buf[idx + 0]).toEqual(v);
                        expect(buf[idx + 1]).toEqual(OPAQUE_BYTE);
                    }
                });
            });

            describe('given 3 input channels', () => {
                it('should return a buffer with N * 4 values, where N is the number of pixels', () => {
                    const r = new Uint8ClampedArray([1, 2, 3, 4]);
                    const g = new Uint8ClampedArray([4, 3, 2, 1]);
                    const b = new Uint8ClampedArray([98, 97, 227, 131]);
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = r.length * 4; // RGBA

                    const result = TextureGenerator.createDataTexture({
                        width: w,
                        height: h,
                        outputType: UnsignedByteType,
                        pixelData: [r, g, b],
                    });

                    const buf = result.texture.image.data;

                    expect(result.texture).toBeInstanceOf(DataTexture);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < r.length; i++) {
                        const vr = r[i];
                        const vg = g[i];
                        const vb = b[i];

                        const idx = i * 4;

                        expect(buf[idx + 0]).toEqual(vr);
                        expect(buf[idx + 1]).toEqual(vg);
                        expect(buf[idx + 2]).toEqual(vb);
                        expect(buf[idx + 3]).toEqual(OPAQUE_BYTE);
                    }
                });
            });

            describe('given 4 input channels', () => {
                it('should return a buffer with N * 4 values, where N is the number of pixels', () => {
                    const r = new Uint8ClampedArray([1, 2, 3, 4]);
                    const g = new Uint8ClampedArray([4, 3, 2, 1]);
                    const b = new Uint8ClampedArray([98, 97, 227, 131]);
                    const a = new Uint8ClampedArray([0, 255, 127, 60]);
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = r.length * 4; // RG

                    const result = TextureGenerator.createDataTexture({
                        width: w,
                        height: h,
                        outputType: UnsignedByteType,
                        pixelData: [r, g, b, a],
                    });

                    const buf = result.texture.image.data;

                    expect(result.texture).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Uint8ClampedArray);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < r.length; i++) {
                        const vr = r[i];
                        const vg = g[i];
                        const vb = b[i];
                        const va = a[i];

                        const idx = i * 4;

                        expect(buf[idx + 0]).toEqual(vr);
                        expect(buf[idx + 1]).toEqual(vg);
                        expect(buf[idx + 2]).toEqual(vb);
                        expect(buf[idx + 3]).toEqual(va);
                    }
                });
            });
        });

        describe('given float32 data', () => {
            describe('given 1 input channel', () => {
                it('should return a buffer with N * 4 values, where N is the number of pixels', () => {
                    const data = new Float32Array([5.2, 4.1, 3.34, 13.2]);
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = data.length * 2; // RG

                    const result = TextureGenerator.createDataTexture({
                        width: w,
                        height: h,
                        outputType: FloatType,
                        pixelData: [data],
                    });

                    const buf = result.texture.image.data;

                    expect(result.texture).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Float32Array);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < data.length; i++) {
                        const v = data[i];
                        const idx = i * 2;
                        // We use toBeCloseTo because our input data is made of numbers
                        // (64-bit floats), whereas the txture only supports 32-bit floats.
                        expect(buf[idx + 0]).toBeCloseTo(v, 2);
                        expect(buf[idx + 1]).toEqual(OPAQUE_FLOAT);
                    }
                });

                it('should honor the scaling values and return a 8-bit texture', () => {
                    const data = new Float32Array([15000, 4050, 0, 7500]);
                    const w = 2;
                    const h = 2;
                    const min = 0;
                    const max = 15000;
                    const expectedOutputLength = data.length * 2; // RG
                    const type = FloatType;

                    const result = TextureGenerator.createDataTexture({
                        width: w,
                        height: h,
                        scaling: { min, max },
                        outputType: type,
                        pixelData: [data],
                    });

                    const buf = result.texture.image.data;

                    expect(result.texture).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Uint8ClampedArray);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < data.length; i++) {
                        const v = data[i];
                        const idx = i * 2;
                        // We use toBeCloseTo because our input data is made of numbers
                        // (64-bit floats), whereas the txture only supports 32-bit floats.
                        const expectedV = Math.floor(MathUtils.mapLinear(v, min, max, 0, 255));
                        expect(buf[idx + 0]).toBeCloseTo(expectedV, 2);
                        expect(buf[idx + 1]).toEqual(OPAQUE_BYTE);
                    }
                });

                it('should set apha at transparent if pixel is NaN, and data to default nodata', () => {
                    const data = new Float32Array([5.2, NaN, 5.2, NaN]);
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = data.length * 2; // RG

                    const result = TextureGenerator.createDataTexture({
                        width: w,
                        height: h,
                        outputType: FloatType,
                        pixelData: [data],
                    });

                    const buf = result.texture.image.data;

                    expect(result.texture).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Float32Array);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < data.length; i++) {
                        const v = data[i];
                        const idx = i * 2;
                        // We use toBeCloseTo because our input data is made of numbers
                        // (64-bit floats), whereas the txture only supports 32-bit floats.
                        const r = buf[idx + 0];
                        const g = buf[idx + 1];

                        expect(r).toBeCloseTo(Number.isNaN(v) ? DEFAULT_NODATA : v, 2);
                        expect(g).toEqual(Number.isNaN(v) ? TRANSPARENT : OPAQUE_FLOAT);
                    }
                });

                it('should set apha at transparent if pixel is NaN, and default no-data as value is no-data not provided', () => {
                    const data = new Float32Array([5.2, NaN, 5.2, NaN]);
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = data.length * 2; // RG

                    const result = TextureGenerator.createDataTexture({
                        width: w,
                        height: h,
                        outputType: FloatType,
                        pixelData: [data],
                    });

                    const buf = result.texture.image.data;

                    expect(result.texture).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Float32Array);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < data.length; i++) {
                        const v = data[i];
                        const idx = i * 2;
                        // We use toBeCloseTo because our input data is made of numbers
                        // (64-bit floats), whereas the txture only supports 32-bit floats.
                        const r = buf[idx + 0];
                        const g = buf[idx + 1];

                        expect(r).toBeCloseTo(Number.isNaN(v) ? DEFAULT_NODATA : v, 2);
                        expect(g).toEqual(Number.isNaN(v) ? TRANSPARENT : OPAQUE_FLOAT);
                    }
                });
            });

            describe('given 3 input channels', () => {
                it('should return a buffer with N * 4 values, where N is the number of pixels', () => {
                    const r = new Float32Array([1.2, 2.44, 3.23, 4.14]);
                    const g = new Float32Array([4.14, 3, 2, 1]);
                    const b = new Float32Array([98.05, 97, 227, 131]);
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = r.length * 4; // RGBA

                    const result = TextureGenerator.createDataTexture({
                        width: w,
                        height: h,
                        outputType: FloatType,
                        pixelData: [r, g, b],
                    });

                    const buf = result.texture.image.data;

                    expect(result.texture).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Float32Array);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < r.length; i++) {
                        const vr = r[i];
                        const vg = g[i];
                        const vb = b[i];

                        const idx = i * 4;

                        expect(buf[idx + 0]).toBeCloseTo(vr);
                        expect(buf[idx + 1]).toBeCloseTo(vg);
                        expect(buf[idx + 2]).toBeCloseTo(vb);
                        expect(buf[idx + 3]).toBe(OPAQUE_FLOAT);
                    }
                });
            });

            describe('given 4 input channels', () => {
                it('should return a buffer with N * 4 values, where N is the number of pixels', () => {
                    const r = new Float32Array([1.2, 2.44, 3.23, 4.14]);
                    const g = new Float32Array([4.14, 3, 2, 1]);
                    const b = new Float32Array([98.05, 97, 227, 131]);
                    const a = new Float32Array([0, 1, 0.4, 0.2]);
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = r.length * 4; // RGBA

                    const result = TextureGenerator.createDataTexture({
                        width: w,
                        height: h,
                        outputType: FloatType,
                        pixelData: [r, g, b, a],
                    });

                    const buf = result.texture.image.data;

                    expect(result.texture).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Float32Array);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < r.length; i++) {
                        const vr = r[i];
                        const vg = g[i];
                        const vb = b[i];
                        const va = a[i];

                        const idx = i * 4;

                        expect(buf[idx + 0]).toBeCloseTo(vr);
                        expect(buf[idx + 1]).toBeCloseTo(vg);
                        expect(buf[idx + 2]).toBeCloseTo(vb);
                        expect(buf[idx + 3]).toBeCloseTo(va);
                    }
                });
            });
        });
    });

    describe('decodeBlob', () => {
        it('throws on unsupported media type', async () => {
            const blob = new Blob([], { type: 'image/unsupported' });
            await expect(TextureGenerator.decodeBlob(blob)).rejects.toThrow(
                /unsupported media type/,
            );
        });
    });

    describe('computeMinMaxFromBuffer', () => {
        it('should honor 2-channel textures', () => {
            const ALPHA_ZERO = 0;
            const ALPHA_ONE = 1;
            const buf = new Float32Array([
                999,
                ALPHA_ZERO,
                -100,
                ALPHA_ONE,
                +100,
                ALPHA_ONE,
                -999,
                ALPHA_ZERO,
            ]);
            const channelCount = 2;
            const minmax = TextureGenerator.computeMinMaxFromBuffer(
                buf,
                0,
                Interpretation.Raw,
                channelCount,
            );
            expect(minmax.min).toEqual(-100);
            expect(minmax.max).toEqual(+100);
        });

        it('should only use the first channel of each pixel', () => {
            const buf = new Float32Array([1, 999, 999, 999, 2, 999, 999, 999]);
            const minmax = TextureGenerator.computeMinMaxFromBuffer(buf);
            expect(minmax.min).toEqual(1);
            expect(minmax.max).toEqual(2);
        });

        it('should ignore NaN', () => {
            const buf = new Float32Array([1, 0, 0, 1, 3, 0, 0, 1, NaN, 0, 0, 1]);
            const minmax = TextureGenerator.computeMinMaxFromBuffer(buf);
            expect(minmax.min).toEqual(1);
            expect(minmax.max).toEqual(3);
        });

        it('should ignore no-data', () => {
            const nodata = -99999;
            const buf = new Float32Array([1, 0, 0, 1, 3, 0, 0, 1, nodata, 0, 0, 1]);
            const minmax = TextureGenerator.computeMinMaxFromBuffer(buf, nodata);
            expect(minmax.min).toEqual(1);
            expect(minmax.max).toEqual(3);
        });
    });

    describe('create1DTexture', () => {
        it('should return a new texture if cached texture does not exist', () => {
            const colors = [new Color('red'), new Color('white'), new Color('cyan')];

            const texture = TextureGenerator.create1DTexture(colors);

            expect(texture.image.width).toEqual(3);
            expect(texture.image.height).toEqual(1);
            expect(texture.type).toEqual(UnsignedByteType);
            expect(texture.format).toEqual(RGBAFormat);

            const buf = texture.image.data;
            expect(buf).toHaveLength(colors.length * 4);

            // red
            expect(buf[0]).toEqual(255);
            expect(buf[1]).toEqual(0);
            expect(buf[2]).toEqual(0);
            expect(buf[3]).toEqual(255);

            // white
            expect(buf[4]).toEqual(255);
            expect(buf[5]).toEqual(255);
            expect(buf[6]).toEqual(255);
            expect(buf[7]).toEqual(255);

            // cyan
            expect(buf[8]).toEqual(0);
            expect(buf[9]).toEqual(255);
            expect(buf[10]).toEqual(255);
            expect(buf[11]).toEqual(255);
        });
    });
    describe('getTextureMemoryUsage', () => {
        it('should return zero for null textures', () => {
            const memUsage = TextureGenerator.getMemoryUsage(null, null);

            expect(memUsage.cpuMemory).toEqual(0);
            expect(memUsage.gpuMemory).toEqual(0);
        });
        it('should return zero for empty textures', () => {
            const empty = new Texture();
            const memUsage = TextureGenerator.getMemoryUsage(empty, null);

            expect(memUsage.cpuMemory).toEqual(0);
            expect(memUsage.gpuMemory).toEqual(0);
        });
        it('should return width * height * 4 bytes of GPU memory usage for canvas textures', () => {
            const empty = new CanvasTexture({ width: 34, height: 111 } as HTMLCanvasElement);
            const memUsage = TextureGenerator.getMemoryUsage(empty, null);

            expect(memUsage.cpuMemory).toEqual(0);
            expect(memUsage.gpuMemory).toEqual(34 * 111 * 4);
        });
        it('[FloatType, RGFormat] should return correct GPU memory usage for render target textures', () => {
            const memUsage = TextureGenerator.getMemoryUsage(
                {
                    isTexture: true,
                    isRenderTargetTexture: true,
                    image: {
                        width: 102,
                        height: 456,
                    },
                    type: FloatType,
                    format: RGFormat,
                } as Texture,
                null,
            );

            const channelCount = 2; // RG
            const bytesPerChannel = 4; // Float
            const bytePerPixel = bytesPerChannel * channelCount;

            expect(memUsage.cpuMemory).toEqual(0);
            expect(memUsage.gpuMemory).toEqual(102 * 456 * bytePerPixel);
        });
        it('[UnsignedByteType, RGBAFormat] should return correct GPU memory usage for render target textures', () => {
            const memUsage = TextureGenerator.getMemoryUsage(
                {
                    isTexture: true,
                    isRenderTargetTexture: true,
                    image: {
                        width: 102,
                        height: 456,
                    },
                    type: UnsignedByteType,
                    format: RGBAFormat,
                } as Texture,
                null,
            );

            const channelCount = 4; // RGBA
            const bytesPerChannel = 1; // UnsignedByte
            const bytePerPixel = bytesPerChannel * channelCount;

            expect(memUsage.cpuMemory).toEqual(0);
            expect(memUsage.gpuMemory).toEqual(102 * 456 * bytePerPixel);
        });
        it('[UnsignedByteType, RGFormat] should return correct GPU and CPU memory usage for data textures', () => {
            const memUsage = TextureGenerator.getMemoryUsage(
                {
                    isTexture: true,
                    isDataTexture: true,
                    image: {
                        data: new Uint8ClampedArray(10),
                        width: 102,
                        height: 456,
                    },
                    type: UnsignedByteType,
                    format: RGBAFormat,
                } as unknown as DataTexture,
                null,
            );

            const channelCount = 4; // RGBA
            const bytesPerChannel = 1; // UnsignedByte
            const bytePerPixel = bytesPerChannel * channelCount;

            const expected = 102 * 456 * bytePerPixel;

            expect(memUsage.cpuMemory).toEqual(expected);
            expect(memUsage.gpuMemory).toEqual(expected);
        });
    });
});
