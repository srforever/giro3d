/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
import * as THREE from 'three';
import TileGeometry from '../Core/TileGeometry.js';
import TileMesh from '../Core/TileMesh.js';
import LayeredMaterial from '../Renderer/LayeredMaterial.js';
import Cache from '../Core/Scheduler/Cache.js';
import TiledNodeProcessing from '../Process/TiledNodeProcessing.js';

function preprocessDataLayer(layer, view, scheduler) {
    if (!layer.schemeTile) {
        throw new Error(`Cannot init tiled layer without schemeTile for layer ${layer.id}`);
    }

    layer.level0Nodes = [];
    layer.onTileCreated = layer.onTileCreated || (() => {});

    const promises = [];

    for (const root of layer.schemeTile) {
        promises.push(
            TiledNodeProcessing.requestNewTile(view, scheduler, layer, root, undefined, 0),
        );
    }
    return Promise.all(promises).then(level0s => {
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
        return null;
    }
    const layer = command.layer;
    const builder = layer.builder;
    const parent = command.requester;
    const level = (command.level === undefined) ? (parent.level + 1) : command.level;

    const { sharableExtent, quaternion, position } = builder.computeSharableExtent(extent);
    const segment = layer.segments || 8;
    const key = `${builder.type}_${segment}_${level}_${sharableExtent._values.join(',')}`;

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
            if (geometry._count === 0) {
                THREE.BufferGeometry.prototype.dispose.call(geometry);
                Cache.delete(key);
            }
        };
    }

    // build tile
    geometry._count++;
    const material = new LayeredMaterial(layer.materialOptions, segment, layer.atlasInfo);
    const tile = new TileMesh(layer, geometry, material, extent, level);
    tile.layers.set(command.threejsLayer);
    if (layer.renderOrder !== undefined) {
        tile.renderOrder = layer.renderOrder;
    }
    material.opacity = layer.opacity;

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

    // no texture opacity
    if (layer.noTextureOpacity !== undefined) {
        tile.material.uniforms.noTextureOpacity.value = layer.noTextureOpacity;
    }

    if (__DEBUG__) {
        tile.material.uniforms.showOutline = { value: layer.showOutline || false };
        tile.material.wireframe = layer.wireframe || false;
    }

    if (parent) {
        tile.setBBoxZ(parent.OBB().z.min, parent.OBB().z.max);
    } else {
        // TODO: probably not here
        const elevation = command.view.getLayers((l, p) => p === layer && l.type === 'elevation');
        if (elevation.length > 0) {
            if (!elevation[0].minmax) {
                console.error('fix the provider');
            }
            tile.setBBoxZ(elevation[0].minmax.min, elevation[0].minmax.max);
        }
    }

    return tile;
}

export default {
    preprocessDataLayer,
    executeCommand,
};
