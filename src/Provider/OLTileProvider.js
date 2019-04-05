import { Texture } from 'three/src/textures/Texture';

import TileState from 'ol/TileState';
import { listenOnce } from 'ol/events';

import Extent from '../Core/Geographic/Extent';

function preprocessDataLayer(layer) {
    const source = layer.source;
    const projection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(projection);
    const sizePixel = source.getTilePixelSize(0 /* z */, 1 /* pixelRatio */, source.getProjection());
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

// eslint-disable-next-line no-unused-vars
function canTextureBeImproved(layer, extent, texture, previousError) {
    const ex = extent.as(layer.extent.crs());
    const tile = selectTile(layer, ex);
    if (texture && texture.extent && texture.extent.isInside(tile.tileExtent)) {
        return;
    }
    return tile;
}

function selectTile(layer, extent) {
    const source = layer.source;
    const projection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(projection);
    const tileCoord = tileCoordForExtent(tileGrid, extent);
    const tile = source.getTile(tileCoord[0], tileCoord[1], tileCoord[2], 1, projection);
    const tileExtent = fromOLExtent(
        tileGrid.getTileCoordExtent(tileCoord), projection.getCode());
    const pitch = extent.offsetToParent(tileExtent);
    return { extent, pitch, tile, tileExtent };
}

function tileCoordForExtent(tileGrid, extent) {
    extent = toOLExtent(extent);
    const minZoom = tileGrid.getMinZoom();
    const maxZoom = tileGrid.getMaxZoom();
    for (let z = maxZoom, tileRange; z >= minZoom; z--) {
        tileRange = tileGrid.getTileRangeForExtentAndZ(extent, z, tileRange);
        if (tileRange.getWidth() == 1 && tileRange.getHeight() == 1) {
            return [z, tileRange.minX, tileRange.minY];
        }
    }
    return null;
}

function executeCommand(command) {
    return loadTile(command.toDownload, command.layer);
}

function loadTile(tile, layer) {
    let promise;
    const imageTile = tile.tile;
    if (imageTile.getState() == TileState.LOADED) {
        promise = Promise.resolve(createTexture(tile, layer));
    } else {
        promise = new Promise((resolve, reject) => {
            imageTile.load();
            listenOnce(imageTile, 'change', evt => {
                const imageTile = evt.target;
                const tileState = imageTile.getState();
                if (tileState == TileState.ERROR) {
                    reject();
                } else if (tileState == TileState.LOADED) {
                    resolve(createTexture(tile, layer));
                }
            });
        });
    }
    return promise;
}

function createTexture(tile, layer) {
    const texture = new Texture(tile.tile.getImage());
    texture.needsUpdate = true;
    texture.premultiplyAlpha = layer.transparent;
    texture.extent = tile.tileExtent;
    return { texture, pitch: tile.pitch };
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
    canTextureBeImproved,
};
