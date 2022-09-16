import {
    DataTexture,
    RGBAFormat,
    Texture,
    Vector4,
} from 'three';

import TileSource from 'ol/source/Tile.js';
import TileState from 'ol/TileState.js';
import { listenOnce } from 'ol/events.js';
import { ImageTile } from 'ol';
import TileGrid from 'ol/tilegrid/TileGrid.js';

import Extent from '../Core/Geographic/Extent.js';
import Layer from '../Core/layer/Layer.js';
import GeographicCanvas from '../utils/GeographicCanvas.js';

// Recycling canvases is interesting because most if not all layers will use square tiles
// At the same resolution (256px). So it's very likely that we are using a single canvas for all
// operations.

const cachedCanvases = new Map();

function createCanvas(width, height) {
    const newCanvas = document.createElement('canvas');
    newCanvas.width = width;
    newCanvas.height = height;
    return newCanvas;
}

function getCanvas(width, height) {
    const key = width + height << 16;
    const result = cachedCanvases.get(key);
    if (result) {
        return result;
    }

    const newCanvas = createCanvas(width, height);
    cachedCanvases.set(key, newCanvas);
    return newCanvas;
}

function preprocessDataLayer(layer) {
    const { source } = layer;
    const projection = source.getProjection();
    /** @type {TileGrid} */
    const tileGrid = source.getTileGridForProjection(projection);
    // Cache the tilegrid because it is constant
    layer.tileGrid = tileGrid;
    const sizePixel = source.getTilePixelSize(0/* z */, 1/* pixelRatio */, projection);
    layer.imageSize = { w: sizePixel[0], h: sizePixel[1] };
    const extent = tileGrid.getExtent();
    layer.extent = fromOLExtent(extent, projection.getCode());
    layer.fx = 0.0;
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
    if (texture && texture.extent
        && texture.extent.isInside(extent)
        && texture.revision === layer.source.getRevision()) {
        return null;
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

    // Let's determine the best zoom level for the target tile.
    for (let z = minZoom; z < maxZoom; z++) {
        const sourceResolution = 1 / tileGrid.getResolution(z);

        if (sourceResolution >= targetResolution) {
            return { z, extent };
        }
    }

    return null;
}

async function executeCommand(command) {
    const { layer } = command;
    const { z, extent } = command.toDownload;

    const images = await loadTiles(extent, z, layer);
    const result = await combineImages(images, layer, extent);
    return result;
}

/**
 * Combines all images into a single texture.
 *
 * @param {Array} sourceImages The images to combine.
 * @param {Layer} layer The target layer.
 * @param {Extent} targetExtent The extent of the destination texture.
 */
async function combineImages(sourceImages, layer, targetExtent) {
    const canvas = new GeographicCanvas({
        extent: targetExtent,
        canvas: getCanvas(layer.imageSize.w, layer.imageSize.h),
    });

    canvas.clear();

    sourceImages.forEach(img => {
        canvas.draw(img, img.extent);
    });

    // This is much, much faster than actually creating an HTMLImageElement.
    const imageData = canvas.getImageData();
    const bitmap = await createImageBitmap(imageData);

    // In the case of color layers, the texture is not used, because the image will be drawn into
    // the tile atlas. However, in the case of elevation layers, the texture is directly used
    // since there can only be one elevation layer per tile.
    // DataTexture is faster to create since it uses the pixel buffer instead of an image element.
    const texture = new DataTexture(imageData, bitmap.width, bitmap.height, RGBAFormat);
    texture.flipY = true;
    texture.extent = targetExtent;
    texture.revision = layer.source.getRevision();

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
        const promise = loadTile(tile, tileExtent);
        promises.push(promise);
    });

    return Promise.all(promises);
}

/**
 * @param {ImageTile} tile The tile to load.
 * @param {Extent} extent The tile extent.
 * @returns {Promise<HTMLImageElement|HTMLCanvasElement|HTMLVideoElement>} The tile image.
 */
function loadTile(tile, extent) {
    if (tile.getState() === TileState.LOADED) {
        const image = tile.getImage();
        image.extent = extent;
        return Promise.resolve(image);
    }
    const promise = new Promise((resolve, reject) => {
        tile.load();
        listenOnce(tile, 'change', evt => {
            const imageTile2 = evt.target;
            const tileState = imageTile2.getState();
            if (tileState === TileState.ERROR) {
                reject();
            } else if (tileState === TileState.LOADED) {
                const image = tile.getImage();
                image.extent = extent;
                resolve(image);
            }
        });
    });

    return promise;
}

// eslint-disable-next-line no-unused-vars
function tileTextureCount(tile, layer) {
    return 1;
}

function tileInsideLimit(tile, layer) {
    const extent = tile.getExtentForLayer(layer);
    // const extent = extents[i].as(layer.extent.crs());
    return extent.isInside(layer.extent);
}

export default {
    preprocessDataLayer,
    executeCommand,
    tileTextureCount,
    tileInsideLimit,
    getPossibleTextureImprovements,
};
