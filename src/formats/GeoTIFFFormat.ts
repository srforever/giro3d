import { fromBlob, Pool } from 'geotiff';
import {
    DataTexture,
    UnsignedByteType,
    FloatType,
    RGBAFormat,
    LinearFilter,
    type PixelFormat,
    RGFormat,
} from 'three';
import TextureGenerator, { type NumberArray, OPAQUE_BYTE, OPAQUE_FLOAT } from '../utils/TextureGenerator';
import type { DecodeOptions } from './ImageFormat';
import ImageFormat from './ImageFormat';

let geotiffWorkerPool: Pool;

/**
 * Decoder for TIFF images.
 *
 */
class GeoTIFFFormat extends ImageFormat {
    readonly isGeoTIFFFormat: boolean = true;

    constructor() {
        super(true, FloatType);

        this.type = 'GeoTIFFFormat';
    }

    /**
     * Decode a tiff blob into a
     * [DataTexture](https://threejs.org/docs/?q=texture#api/en/textures/DataTexture) containing
     * the elevation data.
     *
     * @param blob - the data to decode
     * @param options - the decoding options
     */
    // eslint-disable-next-line class-methods-use-this
    async decode(blob: Blob, options: DecodeOptions = {}) {
        const tiff = await fromBlob(blob);
        const image = await tiff.getImage();

        const height = image.getHeight();
        const width = image.getWidth();

        const bufSize = 4 * width * height; // RGBA

        let dataType;
        let buffer;
        let opaqueValue;
        const nodata = options.noDataValue || image.getGDALNoData() || undefined;

        if (image.getBitsPerSample() === 8) {
            dataType = UnsignedByteType;
            buffer = new Uint8ClampedArray(bufSize);
            opaqueValue = OPAQUE_BYTE;
        } else {
            dataType = FloatType;
            buffer = new Float32Array(bufSize);
            opaqueValue = OPAQUE_FLOAT;
        }

        const spp = image.getSamplesPerPixel();

        // Let's use web workers to decode TIFF in the background
        if (global.Worker && !geotiffWorkerPool) {
            geotiffWorkerPool = new Pool();
        }

        let format: PixelFormat;
        switch (spp) {
            case 1: {
                // grayscale
                const [v] = await image.readRasters({ pool: geotiffWorkerPool }) as NumberArray[];
                format = RGFormat;
                TextureGenerator.fillBuffer(buffer, { nodata }, opaqueValue, v);
            }
                break;
            case 2: {
                // grayscale with alpha
                const [v, a] = await image
                    .readRasters({ pool: geotiffWorkerPool }) as NumberArray[];
                format = RGFormat;
                TextureGenerator.fillBuffer(buffer, {}, opaqueValue, v, a);
            }
                break;
            case 3: {
                // RGB
                const [r, g, b] = await image
                    .readRasters({ pool: geotiffWorkerPool }) as NumberArray[];
                format = RGBAFormat;
                TextureGenerator.fillBuffer(buffer, {}, opaqueValue, r, g, b);
            }
                break;
            case 4: {
                // RGBA
                const [r, g, b, a] = await image
                    .readRasters({ pool: geotiffWorkerPool }) as NumberArray[];
                format = RGBAFormat;
                TextureGenerator.fillBuffer(buffer, {}, opaqueValue, r, g, b, a);
            }
                break;
            default:
                throw new Error(`unsupported channel count: ${spp}`);
        }

        const texture = new DataTexture(buffer, width, height, format, dataType);
        texture.magFilter = LinearFilter;
        texture.minFilter = LinearFilter;
        texture.needsUpdate = true;

        return { texture };
    }
}

export default GeoTIFFFormat;
