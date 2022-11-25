import {
    Texture,
    Vector4,
    WebGLRenderer,
} from 'three';

import TileSource from 'ol/source/Tile.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';

import Extent from '../Core/Geographic/Extent.js';
import Layer from '../Core/layer/Layer.js';
import DataStatus from './DataStatus.js';
import Rect from '../Core/Rect.js';
import ElevationLayer from '../Core/layer/ElevationLayer.js';
import Composer from '../Renderer/composition/Composer.js';
import TextureGenerator from '../utils/TextureGenerator.js';
import Fetcher from './Fetcher.js';
import MemoryTracker from '../Renderer/MemoryTracker.js';
import Cache from '../Core/Scheduler/Cache.js';

const TEXTURE_CACHE_LIFETIME_MS = 1000 * 60; // 60 seconds
const MIN_LEVEL_THRESHOLD = 2;

/**
 * Dispose the texture contained in the promise.
 *
 * @param {Promise<Texture>} promise The texture promise.
 */
function onDelete(promise) {
    promise.then(t => t.dispose());
    promise.catch(e => console.error(e));
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

function toOLExtent(extent) {
    return [
        Math.ceil(extent.west()),
        Math.ceil(extent.south()),
        Math.floor(extent.east()),
        Math.floor(extent.north()),
    ];
}

/**
 * @param {Layer} layer The target layer.
 * @param {Extent} extent The texture extent.
 * @param {Texture} texture The current texture.
 * @returns {object} The result
 */
function getPossibleTextureImprovements(layer, extent, texture) {
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

    return getTileRange(layer.tileGrid, layer.imageSize, extent);
}

/**
 * Selects the best tile range given the provided image size and extent.
 *
 * @param {TileGrid} tileGrid The tile grid
 * @param {object} imageSize The image size, in pixels.
 * @param {number} imageSize.w The image width, in pixels.
 * @param {number} imageSize.h The image height, in pixels.
 * @param {Extent} extent The target extent.
 * @returns {object} An object containing the `tileRange`, `z` level, and `extent`.
 */
function getTileRange(tileGrid, imageSize, extent) {
    const minZoom = tileGrid.getMinZoom();
    const maxZoom = tileGrid.getMaxZoom();
    const olExtent = toOLExtent(extent);

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
            return { z, extent };
        }
    }

    return { z: maxZoom, extent };
}

async function executeCommand(command) {
    const { layer, instance } = command;
    const { z, extent } = command.toDownload;

    const images = await loadTiles(extent, z, layer);
    const result = combineImages(images, instance.renderer, layer, extent);
    return result;
}

/**
 * Combines all images into a single texture.
 *
 * @param {Array} sourceImages The images to combine.
 * @param {WebGLRenderer} renderer The WebGL renderer.
 * @param {Layer} layer The target layer.
 * @param {Extent} targetExtent The extent of the destination texture.
 */
function combineImages(sourceImages, renderer, layer, targetExtent) {
    const isElevationLayer = layer instanceof ElevationLayer;
    const composer = new Composer({
        extent: Rect.fromExtent(targetExtent),
        width: layer.imageSize.w,
        height: layer.imageSize.h,
        webGLRenderer: renderer,
        showImageOutlines: layer.showTileBorders || false,
        renderToCanvas: false,
        createDataCopy: isElevationLayer, // To compute the min/max later
    });

    sourceImages.forEach(img => {
        if (img) {
            composer.draw(img, Rect.fromExtent(img.extent));
        }
    });

    const texture = composer.render();
    texture.extent = targetExtent;
    texture.revision = layer.source.getRevision();

    composer.dispose();

    return { texture, pitch: new Vector4(0, 0, 1, 1) };
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
            const promise = loadTile(url, tileExtent).catch(e => {
                if (e) {
                    console.error(e);
                }
            });
            promises.push(promise);
        }
    });

    return Promise.all(promises);
}

async function loadTileOnce(url, extent) {
    const blob = await Fetcher.blob(url);
    const texture = await TextureGenerator.decodeBlob(blob);
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
 * @returns {Promise<Texture>} The tile image.
 */
async function loadTile(url, extent) {
    let tilePromise;

    // Fetch and create the texture only once per tile.
    // Many source tiles are shared across map tiles. We want to save
    // time by reusing an already processed tile texture.
    const cached = Cache.get(url);
    if (cached) {
        tilePromise = cached;
    } else {
        tilePromise = loadTileOnce(url, extent);
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
