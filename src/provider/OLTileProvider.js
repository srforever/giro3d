import {
    Texture,
    Vector2,
    Vector4,
    WebGLRenderer,
} from 'three';

import TileSource from 'ol/source/Tile.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import TileRange from 'ol/TileRange.js';

import Extent from '../core/geographic/Extent.js';
import DataStatus from './DataStatus.js';
import Rect from '../core/Rect.js';
import TextureGenerator from '../utils/TextureGenerator.js';
import Fetcher from '../utils/Fetcher.js';
import MemoryTracker from '../renderer/MemoryTracker.js';
import { GlobalCache } from '../core/Cache.js';
import WebGLComposer from '../renderer/composition/WebGLComposer.js';
import { Mode } from '../core/layer/Interpretation.js';
import CancelledCommandException from '../core/scheduler/CancelledCommandException.js';
import OpenLayersUtils from '../utils/OpenLayersUtils.js';

const MIN_LEVEL_THRESHOLD = 2;
const tmp = {
    dims: new Vector2(),
    tileRange: new TileRange(0, 0, 0, 0),
};

function onDelete(texture) {
    texture?.dispose();
}

function preprocessDataLayer(layer) {
    const { source } = layer;
    const projection = source.getProjection();
    layer.olprojection = projection;
    /** @type {TileGrid} */
    const tileGrid = source.getTileGridForProjection(projection);
    // Cache the tilegrid because it is constant
    layer.tileGrid = tileGrid;
    layer.getTileUrl = source.getTileUrlFunction();
    layer.flipY = layer.source.format?.flipY || false;
    const extent = tileGrid.getExtent();
    layer.sourceExtent = OpenLayersUtils.fromOLExtent(extent, projection.getCode());
    if (!layer.extent) {
        // In the case where the layer has no extent (when it is not attached to a map,
        // but used to colorize a point cloud for example), we can default to the source extent.
        layer.extent = layer.sourceExtent;
    }
}

function getTileRangeExtent(zoomLevel, tileRange, tileGrid, source, crs) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = tileRange.minX; i <= tileRange.maxX; i++) {
        for (let j = tileRange.minY; j <= tileRange.maxY; j++) {
            const tile = source.getTile(zoomLevel, i, j);
            const tileExtent = tileGrid.getTileCoordExtent(tile.tileCoord);
            minX = Math.min(minX, tileExtent[0]);
            minY = Math.min(minY, tileExtent[1]);
            maxX = Math.max(maxX, tileExtent[2]);
            maxY = Math.max(maxY, tileExtent[3]);
        }
    }

    return new Extent(crs, minX, maxX, minY, maxY);
}

function getPossibleTextureImprovements({
    layer,
    extent,
    texture,
    size,
}) {
    if (!extent.intersectsExtent(layer.extent)) {
        // The tile does not even overlap with the layer extent.
        // This can happen when layers have a different extent from their parent map.
        return DataStatus.DATA_UNAVAILABLE;
    }

    // Let's compute an adjusted extent that will minimize visual artifacts at high zoom levels.
    // First, we compute the best zoom level, then the tile range for this zoom level, then
    // we adjust the extent to exactly fit the subgrid matching this tile range.

    /** @type {TileGrid} */
    const tileGrid = layer.tileGrid;
    const zoomLevel = getZoomLevel(tileGrid, size, extent);
    const tileRange = tileGrid.getTileRangeForExtentAndZ(
        OpenLayersUtils.toOLExtent(extent),
        zoomLevel,
    );

    const crs = extent.crs();

    const tileRangeExtent = getTileRangeExtent(zoomLevel, tileRange, tileGrid, layer.source, crs);

    const tileSize = tileGrid.getTileSize(zoomLevel);
    const tileRangeWidth = tileRange.getWidth() * tileSize;
    const tileRangeHeight = tileRange.getHeight() * tileSize;

    const adjusted = extent.fitToGrid(
        tileRangeExtent,
        tileRangeWidth,
        tileRangeHeight,
        3,
        3,
    );

    const pixelPerfectExtent = adjusted.extent;

    // If the tile is already loaded, don't update
    if (texture
        && texture.extent
        && texture.extent.equals(pixelPerfectExtent)
        && texture.revision === layer.source.getRevision()) {
        return DataStatus.DATA_ALREADY_LOADED;
    }

    const textureWidth = Math.min(size.width, adjusted.width);
    const textureHeight = Math.min(size.height, adjusted.height);

    return {
        zoomLevel,
        tileRange,
        extent: pixelPerfectExtent,
        textureWidth,
        textureHeight,
    };
}

/**
 * Selects the best zoom level given the provided image size and extent.
 *
 * @param {TileGrid} tileGrid The tile grid
 * @param {Vector2} imageSize The image size, in pixels.
 * @param {Extent} extent The target extent.
 * @returns {number} The ideal zoom level for this particular extent.
 */
function getZoomLevel(tileGrid, imageSize, extent) {
    const minZoom = tileGrid.getMinZoom();
    const maxZoom = tileGrid.getMaxZoom();

    const dims = extent.dimensions(tmp.dims);
    const targetResolution = dims.x / imageSize.width;
    const minResolution = tileGrid.getResolution(minZoom);

    if ((targetResolution / minResolution) > MIN_LEVEL_THRESHOLD) {
        // The minimum zoom level has more than twice the resolution
        // than requested. We cannot use this zoom level as it would
        // trigger too many tile requests to fill the extent.
        return DataStatus.DATA_UNAVAILABLE;
    }

    if (minZoom === maxZoom) {
        return minZoom;
    }

    if (targetResolution > minResolution) {
        return minZoom;
    }

    // Let's determine the best zoom level for the target tile.
    for (let z = minZoom; z <= maxZoom; z++) {
        const sourceResolution = tileGrid.getResolution(z);

        if (targetResolution >= sourceResolution) {
            return z;
        }
    }

    return maxZoom;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeCommand(instance, layer, requester, toDownload, earlyDropFunction) {
    const {
        zoomLevel,
        tileRange,
        extent,
        pitch,
        textureWidth,
        textureHeight,
    } = toDownload;

    function throwIfCancelled() {
        if (earlyDropFunction && earlyDropFunction()) {
            throw new CancelledCommandException(layer, requester);
        }
    }

    // Give the opportunity to avoid downloading the images if the command was cancelled.
    await delay(100);
    throwIfCancelled();

    const images = await loadTiles(tileRange, extent.crs(), zoomLevel, layer);

    // Give the opportunity to avoid combining images if the command was cancelled.
    throwIfCancelled();

    // In some cases, all the tile requests on the requested extent fail or end up with no data.
    const actualImages = images.filter(img => img != null);
    if (actualImages.length > 0) {
        return combineImages(
            actualImages,
            textureWidth,
            textureHeight,
            instance.renderer,
            pitch,
            layer,
            extent,
        );
    }

    return null;
}

/**
 * Combines all images into a single texture.
 *
 * @param {Array} sourceImages The images to combine.
 * @param {number} texWidth The texture width.
 * @param {number} texHeight The texture height.
 * @param {WebGLRenderer} renderer The WebGL renderer.
 * @param {Vector4} pitch The custom pitch.
 * @param {module:Core/layer/Layer~Layer} layer The target layer.
 * @param {Extent} targetExtent The extent of the destination texture.
 */
function combineImages(sourceImages, texWidth, texHeight, renderer, pitch, layer, targetExtent) {
    const isElevationLayer = layer.type === 'ElevationLayer';

    let minmax;
    // Let's see if we can avoid computing the min/max on the generated texture (which requires
    // a costly readback). We can use this shortcut only if there is no interpretation to perform
    // on the pixels, and only if all source images have a min/max defined.
    if (isElevationLayer
        && layer.interpretation.mode === Mode.Raw
        && sourceImages.every(t => t.min !== undefined && t.max !== undefined)) {
        let max = -Infinity;
        let min = Infinity;
        sourceImages.forEach(t => {
            max = Math.max(max, t.max);
            min = Math.min(min, t.min);
        });

        minmax = { min, max };
    }
    const shouldComputeMinMax = isElevationLayer && minmax === undefined;

    const composer = new WebGLComposer({
        extent: Rect.fromExtent(targetExtent),
        width: texWidth,
        height: texHeight,
        webGLRenderer: renderer,
        showImageOutlines: layer.showTileBorders || false,
        computeMinMax: shouldComputeMinMax ? { noDataValue: layer.noDataValue } : false,
    });

    const options = {
        interpretation: layer.interpretation,
        flipY: layer.flipY,
        fillNoData: isElevationLayer,
    };

    sourceImages.forEach(img => {
        if (img) {
            composer.draw(img, Rect.fromExtent(img.extent), options);
        }
    });

    const texture = composer.render();
    texture.extent = targetExtent;
    texture.revision = layer.source.getRevision();
    if (minmax !== undefined) {
        texture.min = minmax.min;
        texture.max = minmax.max;
    }

    composer.dispose();

    return { texture, pitch: pitch ?? new Vector4(0, 0, 1, 1) };
}

/**
 * Loads all tiles in the specified tile range.
 *
 * @param {TileRange} tileRange The tile range.
 * @param {string} crs The CRS of the extent.
 * @param {number} zoom The zoom level.
 * @param {module:Core/layer/Layer~Layer} layer The loaded tile images.
 */
function loadTiles(tileRange, crs, zoom, layer) {
    /** @type {TileSource} */
    const source = layer.source;
    /** @type {TileGrid} */
    const tileGrid = layer.tileGrid;

    const promises = [];

    for (let i = tileRange.minX; i <= tileRange.maxX; i++) {
        for (let j = tileRange.minY; j <= tileRange.maxY; j++) {
            const tile = source.getTile(zoom, i, j);
            const olExtent = tileGrid.getTileCoordExtent(tile.tileCoord);
            const tileExtent = OpenLayersUtils.fromOLExtent(olExtent, crs);
            // Don't bother loading tiles that are not in the layer
            if (tileExtent.intersectsExtent(layer.extent)) {
                const url = layer.getTileUrl(tile.tileCoord, 1, layer.olprojection);
                const promise = loadTile(url, tileExtent, layer).catch(e => {
                    console.error(e);
                    return null;
                });
                promises.push(promise);
            }
        }
    }

    return Promise.all(promises);
}

/**
 * Loads the tile once and returns a reusable promise containing the tile texture.
 *
 * @param {string} url The URL of the tile.
 * @param {Extent} extent The extent of the tile.
 * @param {module:Core/layer/Layer~Layer} layer the layer to load tile for
 * @returns {Promise<Texture>|Promise<null>} The tile texture, or null if there is no data.
 */
async function loadTileOnce(url, extent, layer) {
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
    if (layer.source && layer.source.format) {
        let width;
        let height;
        if (layer.tileGrid) {
            const tileSize = layer.tileGrid.getTileSize(0);
            width = tileSize;
            height = tileSize;
        }
        texture = await layer.source.format.decode(blob, {
            noDataValue: layer.noDataValue,
            width,
            height,
        });
    } else {
        texture = await TextureGenerator.decodeBlob(blob);
    }
    texture.extent = extent;
    texture.needsUpdate = true;
    if (__DEBUG__) {
        MemoryTracker.track(texture, 'OL tile');
    }

    // The actual texture replaces the promise
    GlobalCache.delete(`promise-${url}`);
    const size = TextureGenerator.estimateSize(texture);
    GlobalCache.set(`image-${url}`, texture, { onDelete, size });

    return texture;
}

/**
 * @param {string} url The tile URL to load.
 * @param {Extent} extent The tile extent.
 * @param {module:Core/layer/Layer~Layer} layer the layer to load tile for
 * @returns {Promise<Texture>} The tile image.
 */
async function loadTile(url, extent, layer) {
    let tilePromise;

    const promiseKey = `promise-${url}`;
    const imageKey = `image-${url}`;

    const cachedTexture = GlobalCache.get(imageKey);
    if (cachedTexture) {
        return Promise.resolve(cachedTexture);
    }

    // Fetch and create the texture only once per tile.
    // Many source tiles are shared across map tiles. We want to save
    // time by reusing an already processed tile texture.
    const cached = GlobalCache.get(promiseKey);
    if (cached) {
        tilePromise = cached;
    } else {
        tilePromise = loadTileOnce(url, extent, layer);
        GlobalCache.set(promiseKey, tilePromise);
    }

    return tilePromise;
}

function tileInsideLimit(tile, layer) {
    const extent = tile.getExtentForLayer(layer);
    return extent.isInside(layer.sourceExtent);
}

export default {
    preprocessDataLayer,
    executeCommand,
    tileInsideLimit,
    getPossibleTextureImprovements,
};
