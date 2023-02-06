import {
    Texture,
    Vector4,
    WebGLRenderer,
} from 'three';

import TileSource from 'ol/source/Tile.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';

import Extent from '../core/geographic/Extent.js';
import Layer from '../core/layer/Layer.js';
import DataStatus from './DataStatus.js';
import Rect from '../core/Rect.js';
import ElevationLayer from '../core/layer/ElevationLayer.js';
import TextureGenerator from '../utils/TextureGenerator.js';
import Fetcher from './Fetcher.js';
import MemoryTracker from '../renderer/MemoryTracker.js';
import Cache from '../core/scheduler/Cache.js';
import WebGLComposer from '../renderer/composition/WebGLComposer.js';

const TEXTURE_CACHE_LIFETIME_MS = 1000 * 60; // 60 seconds
const MIN_LEVEL_THRESHOLD = 2;

/**
 * Dispose the texture contained in the promise.
 *
 * @param {Promise<Texture>} promise The texture promise.
 */
function onDelete(promise) {
    promise.then(t => t.dispose(), e => console.error(e));
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
    layer.sourceExtent = fromOLExtent(extent, projection.getCode());
    if (!layer.extent) {
        // In the case where the layer has no extent (when it is not attached to a map,
        // but used to colorize a point cloud for example), we can default to the source extent.
        layer.extent = layer.sourceExtent;
    }
}

function fromOLExtent(extent, projectionCode) {
    return new Extent(projectionCode, extent[0], extent[2], extent[1], extent[3]);
}

function toOLExtent(extent, margin = 0) {
    return [
        extent.west() - margin,
        extent.south() - margin,
        extent.east() + margin,
        extent.north() + margin,
    ];
}

function getPossibleTextureImprovements(layer, extent, texture, pitch) {
    if (!extent.intersectsExtent(layer.extent)) {
        // The tile does not even overlap with the layer extent.
        // This can happen when layers have a different extent from their parent map.
        return DataStatus.DATA_UNAVAILABLE;
    }

    if (texture && texture.extent
        && texture.extent.isInside(extent)
        && texture.revision === layer.source.getRevision()) {
        return DataStatus.DATA_ALREADY_LOADED;
    }

    return { zoomLevel: getZoomLevel(layer.tileGrid, layer.imageSize, extent), pitch, extent };
}

/**
 * Selects the best zoom level given the provided image size and extent.
 *
 * @param {TileGrid} tileGrid The tile grid
 * @param {object} imageSize The image size, in pixels.
 * @param {number} imageSize.w The image width, in pixels.
 * @param {number} imageSize.h The image height, in pixels.
 * @param {Extent} extent The target extent.
 * @returns {number} The ideal zoom level for this particular extent.
 */
function getZoomLevel(tileGrid, imageSize, extent) {
    const minZoom = tileGrid.getMinZoom();
    const maxZoom = tileGrid.getMaxZoom();
    // Use a small margin to solve issues in the case where map tiles are perfecly identical
    // to source tiles. In some cases, rounding errors lead the selecting of an abnormal zoom
    // level for some tiles and not others, leading to difference in zoom levels for map tiles
    // with the same size.
    const olExtent = toOLExtent(extent, 0.001);

    const extentWidth = olExtent[2] - olExtent[0];
    const targetResolution = imageSize.w / extentWidth;

    const minResolution = 1 / tileGrid.getResolution(minZoom);

    if ((minResolution / targetResolution) > MIN_LEVEL_THRESHOLD) {
        // The minimum zoom level has more than twice the resolution
        // than requested. We cannot use this zoom level as it would
        // trigger too many tile requests to fill the extent.
        return DataStatus.DATA_UNAVAILABLE;
    }

    // Let's determine the best zoom level for the target tile.
    for (let z = minZoom; z < maxZoom; z++) {
        const sourceResolution = 1 / tileGrid.getResolution(z);

        if (sourceResolution >= targetResolution) {
            return z;
        }
    }

    return maxZoom;
}

async function executeCommand(command) {
    const { layer, instance } = command;
    const { zoomLevel, extent, pitch } = command.toDownload;

    const images = await loadTiles(extent, zoomLevel, layer);
    const result = combineImages(images, instance.renderer, pitch, layer, extent);
    return result;
}

/**
 * Combines all images into a single texture.
 *
 * @param {Array} sourceImages The images to combine.
 * @param {WebGLRenderer} renderer The WebGL renderer.
 * @param {Vector4} pitch The custom pitch.
 * @param {Layer} layer The target layer.
 * @param {Extent} targetExtent The extent of the destination texture.
 */
function combineImages(sourceImages, renderer, pitch, layer, targetExtent) {
    const isElevationLayer = layer instanceof ElevationLayer;
    const composer = new WebGLComposer({
        extent: Rect.fromExtent(targetExtent),
        width: layer.imageSize.w,
        height: layer.imageSize.h,
        webGLRenderer: renderer,
        showImageOutlines: layer.showTileBorders || false,
        createDataCopy: isElevationLayer, // To compute the min/max later
    });

    const options = { interpretation: layer.interpretation, flipY: layer.flipY };

    sourceImages.forEach(img => {
        if (img) {
            composer.draw(img, Rect.fromExtent(img.extent), options);
        }
    });

    const texture = composer.render();
    texture.extent = targetExtent;
    texture.revision = layer.source.getRevision();

    composer.dispose();

    return { texture, pitch: pitch ?? new Vector4(0, 0, 1, 1) };
}

/**
 * Loads all tiles in the specified extent and zoom level.
 *
 * @param {Extent} extent The tile extent.
 * @param {number} zoom The zoom level.
 * @param {Layer} layer The target layer.
 * @returns {Promise<HTMLImageElement[]>} The loaded tile images.
 */
function loadTiles(extent, zoom, layer) {
    /** @type {TileSource} */
    const source = layer.source;
    const tileGrid = layer.tileGrid;
    const crs = extent.crs();

    const promises = [];

    tileGrid.forEachTileCoord(toOLExtent(extent), zoom, ([z, i, j]) => {
        const tile = source.getTile(z, i, j);
        const tileExtent = fromOLExtent(tileGrid.getTileCoordExtent(tile.tileCoord), crs);
        // Don't bother loading tiles that are not in the layer
        if (tileExtent.intersectsExtent(layer.extent)) {
            const url = layer.getTileUrl(tile.tileCoord, 1, layer.olprojection);
            const promise = loadTile(url, tileExtent, layer).catch(e => {
                if (e) {
                    console.error(e);
                }
            });
            promises.push(promise);
        }
    });

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
        return Promise.resolve(null);
    }

    const blob = await response.blob();

    if (!blob) {
        return Promise.resolve(null);
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

    // Fetch and create the texture only once per tile.
    // Many source tiles are shared across map tiles. We want to save
    // time by reusing an already processed tile texture.
    const cached = Cache.get(url);
    if (cached) {
        tilePromise = cached;
    } else {
        tilePromise = loadTileOnce(url, extent, layer);
        Cache.set(url, tilePromise, TEXTURE_CACHE_LIFETIME_MS, onDelete);
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
