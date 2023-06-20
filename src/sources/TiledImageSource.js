/**
 * @module sources/TiledImageSource
 */

import { Vector2 } from 'three';
import { TileRange } from 'ol';
import TileSource from 'ol/source/Tile.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import Extent from '../core/geographic/Extent.js';
import OpenLayersUtils from '../utils/OpenLayersUtils.js';
import Fetcher from '../utils/Fetcher.js';
import TextureGenerator from '../utils/TextureGenerator.js';
import ImageSource, { ImageResult } from './ImageSource.js';
import ImageFormat from '../formats/ImageFormat.js';

const MIN_LEVEL_THRESHOLD = 2;

const tmp = {
    dims: new Vector2(),
    tileRange: new TileRange(0, 0, 0, 0),
};

/**
 * An image source powered by OpenLayers to load tiled images.
 * Supports all subclasses of the OpenLayers [TileSource](https://openlayers.org/en/latest/apidoc/module-ol_source_Tile-TileSource.html).
 *
 * If the tiles of the source are in a format that is not supported directly by the browser,
 * i.e not JPG/PNG/WebP, then you must pass a decoder with the `format` constructor option.
 *
 * To filter out no-data pixels, you may pass the `noDataValue` option in the constructor.
 *
 * @example
 *
 * // To create a source based on the Stamen OpenLayers source, with the 'toner' style.
 * const source = new TiledImageSource({
 *      source: new Stamen({ layer: 'toner' })
 * });
 *
 * // To create a WMS source that downloads TIFF images, eliminating all pixels that have the
 * // value -9999 and replacing them with transparent pixels.
 * const source = new TiledImageSource({
 *      source: new TileWMS({
 *          url: 'http://example.com/wms',
 *          params: {
 *              LAYERS: 'theLayer',
 *              FORMAT: 'image/tiff',
 *          },
 *          projection: 'EPSG:3946',
 *          crossOrigin: 'anonymous',
 *          version: '1.3.0',
 *      }),
 *      format: new GeoTIFFFormat(),
 *      noDataValue: -9999,
 * });
 */
class TiledImageSource extends ImageSource {
    /**
     * @param {object} options The options.
     * @param {TileSource} options.source The OpenLayers tiled source.
     * @param {number} [options.noDataValue] The optional no-data value.
     * @param {ImageFormat} [options.format] The optional image decoder.
     * @api
     */
    constructor({ source, format, noDataValue }) {
        super({ flipY: format?.flipY ?? true });

        this.source = source;
        this.format = format;

        const projection = source.getProjection();
        this.olprojection = projection;
        /** @type {TileGrid} */
        const tileGrid = source.getTileGridForProjection(projection);
        // Cache the tilegrid because it is constant
        this.tileGrid = tileGrid;
        this.getTileUrl = source.getTileUrlFunction();
        const extent = tileGrid.getExtent();
        this.noDataValue = noDataValue;
        this.sourceExtent = OpenLayersUtils.fromOLExtent(extent, projection.getCode());
    }

    getExtent() {
        return this.sourceExtent;
    }

    contains(extent) {
        return this.sourceExtent.intersectsExtent(extent);
    }

    /**
     * Selects the best zoom level given the provided image size and extent.
     *
     * @param {Extent} extent The target extent.
     * @param {number} width The width in pixel of the target extent.
     * @returns {number} The ideal zoom level for this particular extent.
     */
    getZoomLevel(extent, width) {
        const minZoom = this.tileGrid.getMinZoom();
        const maxZoom = this.tileGrid.getMaxZoom();

        function round1000000(n) {
            return Math.round(n * 1000000) / 1000000;
        }

        const dims = extent.dimensions(tmp.dims);
        const targetResolution = round1000000(dims.x / width);
        const minResolution = this.tileGrid.getResolution(minZoom);

        if (targetResolution / minResolution > MIN_LEVEL_THRESHOLD) {
            // The minimum zoom level has more than twice the resolution
            // than requested. We cannot use this zoom level as it would
            // trigger too many tile requests to fill the extent.
            return null;
        }

        if (minZoom === maxZoom) {
            return minZoom;
        }

        if (targetResolution > minResolution) {
            return minZoom;
        }

        // Let's determine the best zoom level for the target tile.
        for (let z = minZoom; z <= maxZoom; z++) {
            const sourceResolution = round1000000(this.tileGrid.getResolution(z));

            if (targetResolution >= sourceResolution) {
                return z;
            }
        }

        return maxZoom;
    }

    /**
     * Gets the images for the specified extent and pixel size.
     *
     * @api
     * @param {object} options The options.
     * @param {Extent} options.extent The extent of the request area.
     * @param {number} options.width The pixel width of the request area.
     * @param {string} options.id The identifier of the node that emitted the request.
     * @param {number} options.height The pixel height of the request area.
     * @param {AbortSignal} [options.signal] The optional abort signal.
     * @returns {Array<{ id: string, request: function(()):Promise<ImageResult>}>} An array
     * containing the functions to generate the images asynchronously.
     */
    getImages(options) {
        const {
            extent, width, signal,
        } = options;

        signal?.throwIfAborted();

        /** @type {TileGrid} */
        const tileGrid = this.tileGrid;
        const zoomLevel = this.getZoomLevel(extent, width);
        if (zoomLevel == null) {
            return [];
        }
        const tileRange = tileGrid.getTileRangeForExtentAndZ(
            OpenLayersUtils.toOLExtent(extent),
            zoomLevel,
        );

        const images = this.loadTiles(tileRange, extent.crs(), zoomLevel);

        return images;
    }

    /**
     * Loads the tile once and returns a reusable promise containing the tile texture.
     *
     * @param {string} id The id of the tile.
     * @param {string} url The URL of the tile.
     * @param {Extent} extent The extent of the tile.
     * @returns {Promise<ImageResult>|Promise<null>} The tile texture, or null if there is no data.
     */
    async loadTile(id, url, extent) {
        const response = await Fetcher.fetch(url);

        // If the response is 204 No Content for example, we have nothing to do.
        // This happens when a tile request is valid, but points to a region with no data.
        // Note: we let the HTTP handler do the logging for us in case of 4XX errors.
        if (response.status !== 200) {
            return null;
        }

        const blob = await response.blob();

        if (!blob) {
            return null;
        }

        let texture;
        if (this.format) {
            let width;
            let height;
            if (this.tileGrid) {
                const tileSize = this.tileGrid.getTileSize(0);
                width = tileSize;
                height = tileSize;
            }
            texture = await this.format.decode(blob, {
                noDataValue: this.noDataValue,
                width,
                height,
            });
        } else {
            texture = await TextureGenerator.decodeBlob(blob);
        }
        texture.extent = extent;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;

        return new ImageResult({
            texture, extent, id,
        });
    }

    /**
     * Loads all tiles in the specified tile range.
     *
     * @param {TileRange} tileRange The tile range.
     * @param {string} crs The CRS of the extent.
     * @param {number} zoom The zoom level.
     */
    loadTiles(tileRange, crs, zoom) {
        /** @type {TileSource} */
        const source = this.source;
        /** @type {TileGrid} */
        const tileGrid = this.tileGrid;

        const promises = [];

        for (let i = tileRange.minX; i <= tileRange.maxX; i++) {
            for (let j = tileRange.minY; j <= tileRange.maxY; j++) {
                const tile = source.getTile(zoom, i, j);
                const coord = tile.tileCoord;
                const olExtent = tileGrid.getTileCoordExtent(coord);
                const tileExtent = OpenLayersUtils.fromOLExtent(olExtent, crs);
                const id = `${coord[0]}-${coord[1]}-${coord[2]}`;
                // Don't bother loading tiles that are not in the layer
                if (tileExtent.intersectsExtent(this.sourceExtent)) {
                    const url = this.getTileUrl(coord, 1, this.olprojection);
                    const request = () => this.loadTile(id, url, tileExtent);
                    promises.push({ id, request });
                }
            }
        }

        return promises;
    }
}

export default TiledImageSource;
