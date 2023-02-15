/**
 * @module formats/BilFormat
 */
import { FloatType } from 'three';
import ImageFormat from './ImageFormat.js';
import TextureGenerator from '../utils/TextureGenerator.js';

/**
 * A format class representing the [Bil format](https://desktop.arcgis.com/en/arcmap/10.3/manage-data/raster-and-images/bil-bip-and-bsq-raster-files.htm).
 *
 * At the moment, only single band BIL format are supported and it is tested only on IGN elevation
 * WMS layers.
 *
 * Example usage:
 *
 * ```js
 * // Create an elevation source
 * const elevationSource = new TileWMS({
 *     url: 'https://wxs.ign.fr/altimetrie/geoportail/r/wms',
 *     projection: 'EPSG:2154',
 *     crossOrigin: 'anonymous',
 *     params: {
 *         LAYERS: ['ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES'],
 *         FORMAT: 'image/x-bil;bits=32',
 *     },
 *     version: '1.3.0',
 * });
 *
 * // set the format. At the moment, this must be done separately from the source creation.
 * elevationSource.format = new BilFormat();
 *
 * const elevationLayer = new ElevationLayer(
 *     'wms_elevation',
 *     {
 *         source: elevationSource,
 *     },
 * );
 *
 * map.addLayer(elevationLayer);
 *
 * ```
 * [See it in action](/examples/ign_ortho_elevation.html).
 *
 * @api
 */
class BilFormat extends ImageFormat {
    constructor() {
        super(true);
    }

    /**
     * Decode a Bil blob into a
     * [DataTexture](https://threejs.org/docs/?q=texture#api/en/textures/DataTexture) containing
     * the elevation data. At the moment only one band BIL is supported.
     *
     * @param {Blob} blob the data to decode
     * @param {object} options the decoding options
     * @param {number} [options.noDataValue] pixel below this value are considered as no data.
     * @param {object} [options.width] The texture width.
     * @param {object} [options.height] The texture height.
     * present, this format will attempt to get it from the tiff metadata.
     * @api
     */
    // eslint-disable-next-line class-methods-use-this
    async decode(blob, options = {}) {
        const buf = await blob.arrayBuffer();
        const floatArray = new Float32Array(buf);

        // NOTE for Bil format, we consider everything that is under noDataValue as noDataValue
        // this is consistent with the servers behaviour we tested but if you see services that
        // expects something different, don't hesitate to question the next loop
        for (let i = 0; i < floatArray.length; i++) {
            if (floatArray[i] <= options.noDataValue) {
                floatArray[i] = options.noDataValue;
            }
        }

        const opts = {
            nodata: options.noDataValue,
            width: options.width,
            height: options.height,
        };
        const texture = TextureGenerator.createDataTexture(opts, FloatType, floatArray);
        const { min, max } = TextureGenerator.computeMinMax(floatArray, options.noDataValue);
        texture.min = min;
        texture.max = max;
        texture.generateMipmaps = false;
        return texture;
    }
}

export default BilFormat;
