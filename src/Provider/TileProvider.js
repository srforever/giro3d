import { Map, requestNewTile } from '../entities/Map.js';

/**
 * @param {Map} map The map.
 */
function preprocessDataLayer(map) {
    map.level0Nodes = [];
    map.onTileCreated = map.onTileCreated || (() => {});

    // If the map is not square, we want to have more than a single
    // root tile to avoid elongated tiles that hurt visual quality and SSE computation.
    const subdivs = selectBestSubdivisions(map.extent);
    const rootExtents = map.extent.split(subdivs.x, subdivs.y);

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

function selectBestSubdivisions(extent) {
    const dims = extent.dimensions();
    const ratio = dims.x / dims.y;
    let x; let y;

    if (ratio > 1) {
        // Our extent is an horizontal rectangle
        x = Math.round(ratio);
        y = 1;
    } else {
        // Our extent is an vertical rectangle
        x = 1;
        y = Math.round(1 / ratio);
    }

    return { x, y };
}

function executeCommand() {
}

export default {
    preprocessDataLayer,
    executeCommand,
};
