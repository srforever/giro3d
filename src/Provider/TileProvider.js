/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
import * as THREE from 'three';
import TileGeometry from '../Core/TileGeometry';
import TileMesh from '../Core/TileMesh';
import LayeredMaterial from '../Renderer/LayeredMaterial';
import CancelledCommandException from '../Core/Scheduler/CancelledCommandException';
import Cache from '../Core/Scheduler/Cache';
import TiledNodeProcessing from '../Process/TiledNodeProcessing';

function preprocessDataLayer(layer, view, scheduler) {
    if (!layer.schemeTile) {
        throw new Error(`Cannot init tiled layer without schemeTile for layer ${layer.id}`);
    }

    layer.level0Nodes = [];
    layer.onTileCreated = layer.onTileCreated || (() => {});

    const promises = [];

    for (const root of layer.schemeTile) {
        promises.push(TiledNodeProcessing.requestNewTile(view, scheduler, layer, root, undefined, 0));
    }
    return Promise.all(promises).then((level0s) => {
        layer.level0Nodes = level0s;
        for (const level0 of level0s) {
            layer.object3d.add(level0);
            level0.updateMatrixWorld();
        }
    });
}

function executeCommand(command) {
    const extent = command.extent;
    if (command.requester &&
        !command.requester.material) {
        // request has been deleted
        return;
    }
    const layer = command.layer;
    const builder = layer.builder;
    const parent = command.requester;
    const level = (command.level === undefined) ? (parent.level + 1) : command.level;

    const { sharableExtent, quaternion, position } = builder.computeSharableExtent(extent);
    const segment = layer.segments || 8;
    const key = `${builder.type}_${segment}_${level}_${extent._values.join(',')}`;

    let geometry = Cache.get(key);
    // build geometry if doesn't exist
    if (!geometry) {
        const paramsGeometry = {
            extent: sharableExtent,
            level,
            segment,
            disableSkirt: layer.disableSkirt,
        };

        geometry = new TileGeometry(paramsGeometry, builder);
        Cache.set(key, geometry);

        geometry._count = 0;
        geometry.dispose = () => {
            geometry._count--;
            if (geometry._count == 0) {
                THREE.BufferGeometry.prototype.dispose.call(geometry);
                Cache.delete(key);
            }
        };
    }

    // build tile
    geometry._count++;
    const material = new LayeredMaterial(layer.materialOptions, segment);
    material.uniforms.validityExtent.value.x = layer.validityExtent.west();
    material.uniforms.validityExtent.value.y = layer.validityExtent.south();
    material.uniforms.validityExtent.value.z = layer.validityExtent.east();
    material.uniforms.validityExtent.value.w = layer.validityExtent.north();
    const tile = new TileMesh(layer, geometry, material, extent, level);
    tile.layers.set(command.threejsLayer);

    if (parent && parent instanceof TileMesh) {
        // get parent extent transformation
        const pTrans = builder.computeSharableExtent(parent.extent);
        // place relative to his parent
        position.sub(pTrans.position).applyQuaternion(pTrans.quaternion.inverse());
        quaternion.premultiply(pTrans.quaternion);
    }

    tile.position.copy(position);
    tile.quaternion.copy(quaternion);

    tile.material.transparent = layer.opacity < 1.0;
    tile.material.uniforms.opacity.value = layer.opacity;
    tile.setVisibility(false);
    tile.updateMatrix();

    if (layer.noTextureColor) {
        tile.material.uniforms.noTextureColor.value.copy(layer.noTextureColor);
    }

    if (__DEBUG__) {
        tile.material.uniforms.showOutline = { value: layer.showOutline || false };
        tile.material.wireframe = layer.wireframe || false;
    }

    if (parent) {
        tile.setBBoxZ(parent.OBB().z.min, parent.OBB().z.max);
    } else if (layer.materialOptions && layer.materialOptions.useColorTextureElevation) {
        tile.setBBoxZ(layer.materialOptions.colorTextureElevationMinZ, layer.materialOptions.colorTextureElevationMaxZ);
    }

    return tile;
}

export default {
    preprocessDataLayer,
    executeCommand,
};
