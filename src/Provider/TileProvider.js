/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
import { requestNewTile } from '../entities/Map.js';

// eslint-disable-next-line no-unused-vars
function preprocessDataLayer(map) {
    if (!map.schemeTile) {
        throw new Error(`Cannot init tiled layer without schemeTile for layer ${map.id}`);
    }

    map.level0Nodes = [];
    map.onTileCreated = map.onTileCreated || (() => {});

    const promises = [];

    for (const root of map.schemeTile) {
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

function executeCommand() {
}

export default {
    preprocessDataLayer,
    executeCommand,
};
