import { Vector4 } from 'three/src/math/Vector4';
import { Texture } from 'three/src/textures/Texture';

import OSM from 'ol/source/OSM';
import TileState from 'ol/TileState';
import { listenOnce } from 'ol/events';

import Extent from '../Core/Geographic/Extent';

function preprocessDataLayer(layer) {
    const source = new OSM();
    layer.source = source;
    const extent = source.getTileGrid().getExtent();
    layer.extent = new Extent('EPSG:3857', extent[0], extent[2], extent[1], extent[3]);
    layer.origin = 'top';
    layer.fx = 0.0;
}

function canTextureBeImproved(layer, extents, textures, previousError) {
    for (let i = 0; i < extents.length; i++) {
        const extent = extents[i].as(layer.extent.crs());
        const texture = textures[i];
        if (texture && texture.extent && texture.extent.isInside(extent)) {
            return;
        }
    }
    return selectAllExtentsToDownload(layer, extents, textures, previousError);
}

// eslint-disable-next-line no-unused-vars
function selectAllExtentsToDownload(layer, extents, textures, previousError) {
    const source = layer.source;
    const tileGrid = source.getTileGrid();
    const results = [];
    for (let i = 0; i < extents.length; i++) {
        const extent = extents[i];
        const pitch = new Vector4(0, 0, 1, 1);
        const tileCoord = tileCoordForExtent(tileGrid, extent);
        const tile = source.getTile(
            tileCoord[0], tileCoord[1], tileCoord[2], 1, source.getProjection());
        results.push({ extent, pitch, tile });
    }
    return results;
}

function tileCoordForExtent(tileGrid, extent) {
    extent = [extent.west(), extent.south(), extent.east(), extent.north()];
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
