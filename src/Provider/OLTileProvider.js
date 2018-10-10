import { Texture } from 'three/src/textures/Texture';

import TileState from 'ol/TileState';
import { listenOnce } from 'ol/events';

import Extent from '../Core/Geographic/Extent';

function preprocessDataLayer(layer) {
    const source = layer.source;
    const projection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(projection);
    const extent = tileGrid.getExtent();
    layer.extent = fromOLExtent(extent, projection.getCode());
    layer.fx = 0.0;
}

function fromOLExtent(extent, projectionCode) {
    return new Extent(projectionCode, extent[0], extent[2], extent[1], extent[3]);
}

function toOLExtent(extent) {
    return [extent.west(), extent.south(), extent.east(), extent.north()];
}

// eslint-disable-next-line no-unused-vars
function canTextureBeImproved(layer, extents, textures, previousError) {
    const extent = extents[0].as(layer.extent.crs());
    const texture = textures[0];
    const tile = selectTile(layer, extent);
    if (texture && texture.extent && texture.extent.isInside(tile.tileExtent)) {
        return;
    }
    return [tile];
}

function selectTile(layer, extent) {
    const source = layer.source;
    const projection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(projection);
    const tileCoord = tileCoordForExtent(tileGrid, extent);
    const tile = source.getTile(tileCoord[0], tileCoord[1], tileCoord[2], 1, projection);
    const tileExtent = fromOLExtent(
        tileGrid.getTileCoordExtent(tileCoord), projection.getCode());
    const pitch = tileExtent.offsetToParent(extent);
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
    const promises = [];
    for (const tile of command.toDownload) {
        promises.push(loadTile(tile, command.layer));
    }
    return Promise.all(promises);
}

function loadTile(tile, layer) {
    let promise;
    const imageTile = tile.tile;
    if (imageTile.getState() == TileState.LOADED) {
        promise = Promise.resolve(createTexture(tile, layer));
    } else {
        promise = new Promise((resolve, reject) => {
            imageTile.load();
            listenOnce(imageTile, 'change', (evt) => {
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
    texture.extent = tile.extent;
    return { texture, pitch: tile.pitch };
}

// eslint-disable-next-line no-unused-vars
function tileTextureCount(tile, layer) {
    return 1;
}

function tileInsideLimit(tile, layer) {
    var extents = tile.getCoordsForLayer(layer);
    for (let i = 0; i < extents.length; i++) {
        const extent = extents[i].as(layer.extent.crs());
        if (extent.isInside(layer.extent)) {
            return true;
        }
    }
    return false;
}

export default {
    preprocessDataLayer,
    executeCommand,
    tileTextureCount,
    tileInsideLimit,
    canTextureBeImproved,
};
