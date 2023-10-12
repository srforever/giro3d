import { Texture, Vector2 } from 'three';
import { TileRange } from 'ol';
import type UrlTile from 'ol/source/UrlTile';
import type TileGrid from 'ol/tilegrid/TileGrid.js';
import type Extent from '../core/geographic/Extent';
import OpenLayersUtils from '../utils/OpenLayersUtils';
import Fetcher from '../utils/Fetcher.js';
import TextureGenerator from '../utils/TextureGenerator';
import ImageSource, { type GetImageOptions, ImageResult, type ImageSourceOptions } from './ImageSource';
import ImageFormat from '../formats/ImageFormat';

const MIN_LEVEL_THRESHOLD = 2;

const tmp = {
    dims: new Vector2(),
    tileRange: new TileRange(0, 0, 0, 0),
};

export interface TiledImageSourceOptions extends ImageSourceOptions {
    /**
     * The underlying OpenLayers source.
     */
    source: UrlTile;
    /**
     * The optional no-data value.
     */
    noDataValue?: number;
    /**
     * The optional image decoder.
     */
    format?: ImageFormat;
    /**
     * The optional extent of the source. If not provided, it will be computed from the source.
     */
    extent?: Extent;
}

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
export default class TiledImageSource extends ImageSource {
    readonly isTiledImageSource: boolean = true;
    readonly source: UrlTile;
    readonly format: ImageFormat;
    readonly olprojection: any;
    readonly noDataValue: number;
    private readonly tileGrid: TileGrid;
    private readonly getTileUrl: any;
    private readonly sourceExtent: Extent;

    /**
     * @param options The options.
     */
    constructor(options: TiledImageSourceOptions) {
        super({ flipY: options.format?.flipY ?? true, ...options });

        this.isTiledImageSource = true;
        this.type = 'TiledImageSource';

        this.source = options.source;
        this.format = options.format;

        const projection = this.source.getProjection();
        this.olprojection = projection;
        /** @type {TileGrid} */
        const tileGrid: TileGrid = this.source.getTileGridForProjection(projection);
        // Cache the tilegrid because it is constant
        this.tileGrid = tileGrid;
        this.getTileUrl = this.source.getTileUrlFunction();
        this.noDataValue = options.noDataValue;
        this.sourceExtent = options.extent ?? OpenLayersUtils.fromOLExtent(
            tileGrid.getExtent(),
            projection.getCode(),
        );
    }

    getExtent() {
        return this.sourceExtent;
    }

    getCrs() {
        return this.olprojection.getCode();
    }

    /**
     * Selects the best zoom level given the provided image size and extent.
     *
     * @param extent The target extent.
     * @param width The width in pixel of the target extent.
     * @returns The ideal zoom level for this particular extent.
     */
    getZoomLevel(extent: Extent, width: number): number {
        const minZoom = this.tileGrid.getMinZoom();
        const maxZoom = this.tileGrid.getMaxZoom();

        function round1000000(n: number) {
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

    getImages(options: GetImageOptions) {
        const {
            extent, width, signal,
        } = options;

        signal?.throwIfAborted();

        if (extent.crs() !== this.getCrs()) {
            throw new Error('invalid CRS');
        }

        /** @type {TileGrid} */
        const tileGrid: TileGrid = this.tileGrid;
        const zoomLevel = this.getZoomLevel(extent, width);
        if (zoomLevel == null) {
            return [];
        }
        const tileRange = tileGrid.getTileRangeForExtentAndZ(
            OpenLayersUtils.toOLExtent(extent),
            zoomLevel,
        );

        const images = this.loadTiles(
            tileRange,
            this.getCrs(),
            zoomLevel,
            options.createReadableTextures,
        );

        return images;
    }

    // eslint-disable-next-line class-methods-use-this
    async fetchData(url: string) {
        try {
            const response = await Fetcher.fetch(url);

            // If the response is 204 No Content for example, we have nothing to do.
            // This happens when a tile request is valid, but points to a region with no data.
            // Note: we let the HTTP handler do the logging for us in case of 4XX errors.
            if (response.status !== 200) {
                return null;
            }

            const blob = await response.blob();

            return blob;
        } catch (e) {
            if (e.response?.status === 404) {
                return null;
            }
            throw e;
        }
    }

    /**
     * Loads the tile once and returns a reusable promise containing the tile texture.
     *
     * @param id The id of the tile.
     * @param url The URL of the tile.
     * @param extent The extent of the tile.
     * @param createDataTexture Create readable textures.
     * @returns The tile texture, or null if there is no data.
     */
    async loadTile(id: string, url: string, extent: Extent, createDataTexture: boolean) {
        const blob = await this.fetchData(url);

        if (!blob) {
            return new ImageResult({
                texture: new Texture(), extent, id,
            });
        }

        let texture;
        if (this.format) {
            let width: number;
            let height: number;
            if (this.tileGrid) {
                const tileSize = this.tileGrid.getTileSize(0);
                width = tileSize as number;
                height = tileSize as number;
            }
            texture = await this.format.decode(blob, {
                noDataValue: this.noDataValue,
                width,
                height,
            });
        } else {
            texture = await TextureGenerator.decodeBlob(blob, {
                createDataTexture,
            });
            texture.flipY = false;
        }
        texture.generateMipmaps = false;
        texture.needsUpdate = true;

        return new ImageResult({
            texture, extent, id,
        });
    }

    /**
     * Check if the tile actually intersect with the extent.
     *
     * @param {Extent} extent The extent to test.
     * @returns {boolean} True if the tile must be processed, false otherwise.
     */
    shouldLoad(extent: Extent): boolean {
        // Use the custom contain function if applicable
        if (this.containsFn) {
            return this.containsFn(extent);
        }

        const convertedExtent = extent.clone().as(this.getCrs());

        return convertedExtent.intersectsExtent(this.sourceExtent);
    }

    /**
     * Loads all tiles in the specified tile range.
     *
     * @param tileRange The tile range.
     * @param crs The CRS of the extent.
     * @param zoom The zoom level.
     * @param createDataTexture Creates readable textures.
     */
    loadTiles(tileRange: TileRange, crs: string, zoom: number, createDataTexture: boolean) {
        const source = this.source;
        const tileGrid = this.tileGrid;

        const fullTileRange = tileGrid.getFullTileRange(zoom);

        const promises = [];

        for (let i = tileRange.minX; i <= tileRange.maxX; i++) {
            for (let j = tileRange.minY; j <= tileRange.maxY; j++) {
                if (!fullTileRange.containsXY(i, j)) {
                    continue;
                }
                const tile = source.getTile(zoom, i, j, undefined, undefined);
                const coord = tile.tileCoord;
                const olExtent = tileGrid.getTileCoordExtent(coord);
                const tileExtent = OpenLayersUtils.fromOLExtent(olExtent, crs);
                const id = `${coord[0]}-${coord[1]}-${coord[2]}`;
                // Don't bother loading tiles that are not in the layer
                if (this.shouldLoad(tileExtent)) {
                    const url = this.getTileUrl(coord, 1, this.olprojection);
                    const request = () => this.loadTile(id, url, tileExtent, createDataTexture);
                    promises.push({ id, request });
                }
            }
        }

        return promises;
    }
}
