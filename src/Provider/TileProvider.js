import Extent from '../Core/Geographic/Extent.js';
import { Map, requestNewTile } from '../entities/Map.js';

/**
 * @param {Map} map The map.
 */
function preprocessDataLayer(map) {
    map.level0Nodes = [];
    map.onTileCreated = map.onTileCreated || (() => {});

    // If the map is not square, we want to have more than a single
    // root tile to avoid elongated tiles that hurt visual quality and SSE computation.
    const rootExtents = map.extent.split(map.subdivisions.x, map.subdivisions.y);

    map.imageSize = computeImageSize(rootExtents[0]);

    const promises = [];

    for (const root of rootExtents) {
        promises.push(
            requestNewTile(map, root, undefined, 0),
        );
    }
    return Promise.all(promises).then(level0s => {
        map.level0Nodes = level0s;
        for (const level0 of level0s) {
            map.object3d.add(level0);
            level0.updateMatrixWorld();
        }
    });
}

/**
 * Compute the best image size for tiles, taking into account the extent ratio.
 * In other words, rectangular tiles will have more pixels in their longest side.
 *
 * @param {Extent} extent The map extent.
 */
function computeImageSize(extent) {
    const baseSize = 256;
    const dims = extent.dimensions();
    const ratio = dims.x / dims.y;
    if (Math.abs(ratio - 1) < 0.01) {
        // We have a square tile
        return { w: baseSize, h: baseSize };
    }

    if (ratio > 1) {
        // We have an horizontal tile
        return { w: Math.round(baseSize * ratio), h: baseSize };
    }

    // We have a vertical tile
    return { w: baseSize, h: Math.round(baseSize * (1 / ratio)) };
}

function executeCommand() {
}

export default {
    preprocessDataLayer,
    executeCommand,
};
