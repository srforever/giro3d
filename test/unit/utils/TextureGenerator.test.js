import { DataTexture, FloatType, UnsignedByteType } from 'three';
import createDataTexture, { OPAQUE_BYTE, OPAQUE_FLOAT, TRANSPARENT } from '../../../src/utils/TextureGenerator.js';

global.ImageData = function ImageData(buf, w, h) {
    this.data = buf;
    this.width = w;
    this.height = h;
};

describe('TextureGenerator', () => {
    describe('createDataTexture', () => {
        describe('given unsigned 8-bit data', () => {
            describe('given 1 input channel', () => {
                it('should return a buffer with N * 4 values, where N is the number of pixels', () => {
                    const data = [5, 4, 3, 2];
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = data.length * 4; // RGBA

                    const result = createDataTexture(w, h, {}, UnsignedByteType, data);

                    const buf = result.image.data.data;

                    expect(result).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Uint8ClampedArray);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < data.length; i++) {
                        const v = data[i];
                        const idx = i * 4;
                        expect(buf[idx + 0]).toEqual(v);
                        expect(buf[idx + 1]).toEqual(v);
                        expect(buf[idx + 2]).toEqual(v);
                        expect(buf[idx + 3]).toEqual(OPAQUE_BYTE);
                    }
                });
            });

            describe('given 3 input channels', () => {
                it('should return a buffer with N * 4 values, where N is the number of pixels', () => {
                    const r = [1, 2, 3, 4];
                    const g = [4, 3, 2, 1];
                    const b = [98, 97, 227, 131];
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = r.length * 4; // RGBA

                    const result = createDataTexture(w, h, {}, UnsignedByteType, r, g, b);

                    const buf = result.image.data.data;

                    expect(result).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Uint8ClampedArray);
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
                    const r = [1, 2, 3, 4];
                    const g = [4, 3, 2, 1];
                    const b = [98, 97, 227, 131];
                    const a = [0, 255, 127, 60];
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = r.length * 4; // RGBA

                    const result = createDataTexture(w, h, {}, UnsignedByteType, r, g, b, a);

                    const buf = result.image.data.data;

                    expect(result).toBeInstanceOf(DataTexture);
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
                    const data = [5.2, 4.1, 3.34, 13.2];
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = data.length * 4; // RGBA

                    const result = createDataTexture(w, h, {}, FloatType, data);

                    const buf = result.image.data;

                    expect(result).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Float32Array);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < data.length; i++) {
                        const v = data[i];
                        const idx = i * 4;
                        // We use toBeCloseTo because our input data is made of numbers
                        // (64-bit floats), whereas the txture only supports 32-bit floats.
                        expect(buf[idx + 0]).toBeCloseTo(v, 2);
                        expect(buf[idx + 1]).toBeCloseTo(v, 2);
                        expect(buf[idx + 2]).toBeCloseTo(v, 2);
                        expect(buf[idx + 3]).toEqual(OPAQUE_FLOAT);
                    }
                });

                it('should honor the scaling values and return a 8-bit texture', () => {
                    const data = [15000, 4050, 0, 7500];
                    const w = 2;
                    const h = 2;
                    const min = 0;
                    const max = 15000;
                    const factor = 255 / (max - min);
                    const expectedOutputLength = data.length * 4; // RGBA
                    const type = FloatType;

                    const result = createDataTexture(w, h, { scaling: { min, max } }, type, data);

                    const buf = result.image.data.data;

                    expect(result).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Uint8ClampedArray);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < data.length; i++) {
                        const v = data[i];
                        const idx = i * 4;
                        // We use toBeCloseTo because our input data is made of numbers
                        // (64-bit floats), whereas the txture only supports 32-bit floats.
                        const expectedV = Math.round((v - min) * factor);
                        expect(buf[idx + 0]).toBeCloseTo(expectedV, 2);
                        expect(buf[idx + 1]).toBeCloseTo(expectedV, 2);
                        expect(buf[idx + 2]).toBeCloseTo(expectedV, 2);
                        expect(buf[idx + 3]).toEqual(OPAQUE_BYTE);
                    }
                });

                it('should set apha at transparent if no-data is provided', () => {
                    const data = [5.2, 4.1, 5.2, 13.2];
                    const nodata = 5.2;
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = data.length * 4; // RGBA

                    const result = createDataTexture(w, h, { nodata }, FloatType, data);

                    const buf = result.image.data;

                    expect(result).toBeInstanceOf(DataTexture);
                    expect(buf).toBeInstanceOf(Float32Array);
                    expect(buf).toHaveLength(expectedOutputLength);

                    for (let i = 0; i < data.length; i++) {
                        const v = data[i];
                        const idx = i * 4;
                        // We use toBeCloseTo because our input data is made of numbers
                        // (64-bit floats), whereas the txture only supports 32-bit floats.
                        expect(buf[idx + 0]).toBeCloseTo(v, 2);
                        expect(buf[idx + 1]).toBeCloseTo(v, 2);
                        expect(buf[idx + 2]).toBeCloseTo(v, 2);
                        expect(buf[idx + 3]).toEqual(v === nodata ? TRANSPARENT : OPAQUE_FLOAT);
                    }
                });
            });

            describe('given 3 input channels', () => {
                it('should return a buffer with N * 4 values, where N is the number of pixels', () => {
                    const r = [1.2, 2.44, 3.23, 4.14];
                    const g = [4.14, 3, 2, 1];
                    const b = [98.05, 97, 227, 131];
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = r.length * 4; // RGBA

                    const result = createDataTexture(w, h, {}, FloatType, r, g, b);

                    const buf = result.image.data;

                    expect(result).toBeInstanceOf(DataTexture);
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
                    const r = [1.2, 2.44, 3.23, 4.14];
                    const g = [4.14, 3, 2, 1];
                    const b = [98.05, 97, 227, 131];
                    const a = [0, 1, 0.4, 0.2];
                    const w = 2;
                    const h = 2;
                    const expectedOutputLength = r.length * 4; // RGBA

                    const result = createDataTexture(w, h, {}, FloatType, r, g, b, a);

                    const buf = result.image.data;

                    expect(result).toBeInstanceOf(DataTexture);
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
});
