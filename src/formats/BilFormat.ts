import { FloatType } from 'three';
import type { DecodeOptions } from './ImageFormat';
import ImageFormat from './ImageFormat';
import TextureGenerator, { type CreateDataTextureOptions } from '../utils/TextureGenerator';

/**
 * Decoder for [BIL](https://desktop.arcgis.com/en/arcmap/10.3/manage-data/raster-and-images/bil-bip-and-bsq-raster-files.htm) images.
 *
 * At the moment, only single band BIL files are supported and it is tested only on IGN elevation
 * WMS and WMTS layers.
 *
 * ```js
 *  // Create an elevation source
 * const source = new WmsSource({
 *     url: 'https://data.geopf.fr/wms-r',
 *     projection: 'EPSG:2154',
 *     layer: 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES',
 *     imageFormat: 'image/x-bil;bits=32',
 *     format: new BilFormat(),
 * });
 *
 * const elevationLayer = new ElevationLayer({ source });
 *
 * map.addLayer(elevationLayer);
 *
 * ```
 * [See it in action](/examples/ign_ortho_elevation.html).
 *
 */
class BilFormat extends ImageFormat {
    readonly isBilFormat: boolean = true;
    constructor() {
        super(true, FloatType);

        this.type = 'BilFormat';
    }

    /**
     * Decode a Bil blob into a
     * [DataTexture](https://threejs.org/docs/?q=texture#api/en/textures/DataTexture) containing
     * the elevation data. At the moment only one band BIL is supported.
     *
     * @param blob - the data to decode
     * @param options - the decoding options
     */
    // eslint-disable-next-line class-methods-use-this
    async decode(blob: Blob, options: DecodeOptions = {}) {
        const buf = await blob.arrayBuffer();
        const floatArray = new Float32Array(buf);

        // NOTE for BIL format, we consider everything that is under noDataValue as noDataValue
        // this is consistent with the servers behaviour we tested but if you see services that
        // expects something different, don't hesitate to question the next loop
        for (let i = 0; i < floatArray.length; i++) {
            const value = floatArray[i];
            if (value <= options.noDataValue) {
                floatArray[i] = options.noDataValue;
            }
        }

        const opts: CreateDataTextureOptions = {
            outputType: FloatType,
            pixelData: [floatArray],
            width: options.width,
            height: options.height,
            nodata: options.noDataValue,
        };

        return await TextureGenerator.createDataTextureAsync(opts);
    }
}

export default BilFormat;
