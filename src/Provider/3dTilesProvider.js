import * as THREE from 'three';
import B3dmParser from '../Parser/B3dmParser.js';
import PntsParser from '../Parser/PntsParser.js';
import Fetcher from './Fetcher.js';
import { pre3dTilesUpdate, process3dTilesNode, init3dTilesLayer } from '../Process/3dTilesProcessing.js';
import utf8Decoder from '../utils/Utf8Decoder.js';
import Picking from '../Core/Picking.js';
import Points from '../Core/Points.js';
import PointsMaterial from '../Renderer/PointsMaterial.js';
import Cache from '../Core/Scheduler/Cache.js';

const identity = new THREE.Matrix4();

export class $3dTilesIndex {
    constructor(tileset, baseURL) {
        this._counter = 1;
        this.index = {};
        this._inverseTileTransform = new THREE.Matrix4();
        this._recurse(tileset.root, baseURL);

        // Add a special tileId = 0 which acts as root of the tileset but has
        // no content.
        // This way we can safely cleanup the root of the tileset in the processing
        // code, and keep a valid layer.root tile.
        // this.index[0] = {
        //     baseURL: this.index[1].baseURL,
        //     viewerRequestVolume: this.index[1].viewerRequestVolume,
        //     boundingVolume: this.index[1].boundingVolume,
        //     children: [1],
        //     transform: this.index[1].transform,
        //     refine: this.index[1].refine,
        //     geometricError: this.index[1].geometricError,
        // };
    }

    _recurse(node, baseURL, parent) {
        // compute transform (will become Object3D.matrix when the object is downloaded)
        node.transform = node.transform
            ? (new THREE.Matrix4()).fromArray(node.transform) : identity;

        // The only reason to store _worldFromLocalTransform is because of extendTileset where we
        // need the transform chain for one node.
        node._worldFromLocalTransform = node.transform;
        if (parent && parent._worldFromLocalTransform) {
            if (node.transform) {
                node._worldFromLocalTransform = new THREE.Matrix4().multiplyMatrices(
                    parent._worldFromLocalTransform, node.transform,
                );
            } else {
                node._worldFromLocalTransform = parent._worldFromLocalTransform;
            }
        }

        // this._inverseTileTransform.getInverse(node._worldFromLocalTransform);
        // getBox only use this._inverseTileTransform for volume.region so let's not
        // compute the inverse matrix each time
        if (node._worldFromLocalTransform) {
            this._inverseTileTransform.getInverse(node._worldFromLocalTransform);
        } else {
            this._inverseTileTransform.identity();
        }

        node.viewerRequestVolume = node.viewerRequestVolume
            ? getBox(node.viewerRequestVolume, this._inverseTileTransform) : undefined;
        node.boundingVolume = getBox(node.boundingVolume, this._inverseTileTransform);
        node.refine = node.refine || (parent ? parent.refine : 'ADD');

        this.index[this._counter] = node;
        node.tileId = this._counter;
        node.baseURL = baseURL;
        this._counter++;
        if (node.children) {
            for (const child of node.children) {
                try {
                    this._recurse(child, baseURL, node);
                } catch (error) {
                    node.children[node.children.indexOf(child)] = undefined;
                }
            }
            const count = node.children.length;
            node.children = node.children.filter(n => n !== undefined);
            if (node.children.length !== count) {
                // console.log('Removed elements:', count - node.children.length);
            }
        }
    }

    extendTileset(tileset, nodeId, baseURL) {
        this._recurse(tileset.root, baseURL, this.index[nodeId]);
        this.index[nodeId].children = [tileset.root];
        this.index[nodeId].isTileset = true;
    }
}

export function getObjectToUpdateForAttachedLayers(meta) {
    if (!meta.content) {
        return null;
    }
    const result = [];
    meta.content.traverse(obj => {
        if (obj.isObject3D && obj.material && obj.layer === meta.layer) {
            result.push(obj);
        }
    });
    const p = meta.parent;
    if (p && p.content) {
        return {
            elements: result,
            parent: p.content,
        };
    }
    return {
        elements: result,
    };
}

function preprocessDataLayer(layer, view, scheduler) {
    layer.preUpdate = layer.preUpdate || pre3dTilesUpdate;
    layer.update = layer.update || process3dTilesNode();
    layer.sseThreshold = layer.sseThreshold || 16;
    layer.cleanupDelay = layer.cleanupDelay || 1000;
    // override the default method, since updated objects are metadata in this case
    layer.getObjectToUpdateForAttachedLayers = getObjectToUpdateForAttachedLayers;

    // TODO: find a better way to know that this layer is about pointcloud ?
    if (layer.material && layer.material.enablePicking) {
        layer.pickObjectsAt = (view2, mouse, radius) => Picking.pickPointsAt(
            view2,
            mouse,
            radius,
            layer,
        );
    }

    layer._cleanableTiles = [];
    return Fetcher.json(layer.url, layer.networkOptions).then(tileset => {
        if (!tileset.root.refine) {
            tileset.root.refine = tileset.refine;
        }

        // Add a tile which acts as root of the tileset but has no content.
        // This way we can safely cleanup the root of the tileset in the processing
        // code, and keep a valid layer.root tile.
        const fakeroot = {
            boundingVolume: tileset.root.boundingVolume,
            geometricError: tileset.geometricError * 10,
            refine: tileset.root.refine,
            transform: tileset.root.transform,
            children: [tileset.root],
        };
        // Remove transform which has been moved up to fakeroot
        tileset.root.transform = undefined;
        // Replace root
        tileset.root = fakeroot;
        layer.tileset = tileset;
        const urlPrefix = layer.url.slice(0, layer.url.lastIndexOf('/') + 1);
        layer.tileIndex = new $3dTilesIndex(tileset, urlPrefix);
        layer.asset = tileset.asset;
        return init3dTilesLayer(view, scheduler, layer, tileset.root);
    });
}

function getBox(volume) {
    if (volume.region) {
        throw new Error('volume.region is unsupported');
    } else if (volume.box) {
        // TODO: only works for axis aligned boxes
        const bbox = volume.box;
        // box[0], box[1], box[2] = center of the box
        // box[3], box[4], box[5] = x axis direction and half-length
        // box[6], box[7], box[8] = y axis direction and half-length
        // box[9], box[10], box[11] = z axis direction and half-length
        const center = new THREE.Vector3(bbox[0], bbox[1], bbox[2]);

        const halfXVector = new THREE.Vector3(bbox[3], bbox[4], bbox[5]);
        const halfYVector = new THREE.Vector3(bbox[6], bbox[7], bbox[8]);
        const halfZVector = new THREE.Vector3(bbox[9], bbox[10], bbox[11]);
        const point1 = center.clone()
            .sub(halfXVector).sub(halfYVector).sub(halfZVector);
        const point2 = center.clone()
            .add(halfXVector).add(halfYVector).add(halfZVector);
        const w = Math.min(point1.x, point2.x);
        const e = Math.max(point1.x, point2.x);
        const s = Math.min(point1.y, point2.y);
        const n = Math.max(point1.y, point2.y);
        const b = Math.min(point1.z, point2.z);
        const t = Math.max(point1.z, point2.z);

        const box = new THREE.Box3(new THREE.Vector3(w, s, b), new THREE.Vector3(e, n, t));
        if (box.getSize(new THREE.Vector3()).length() === 0) {
            throw new Error('Invalid boundingVolume (0 sized box)');
        }
        return { box };
    } else if (volume.sphere) {
        const sphere = new THREE.Sphere(
            new THREE.Vector3(volume.sphere[0], volume.sphere[1], volume.sphere[2]),
            volume.sphere[3],
        );
        return { sphere };
    } else {
        // TODO we should probably do
        // throw new Error('volume has neither region, nor box, nor sphere...');
        // but as I'm just correcting linter errors here, let's keep the old behaviour for now
        return null;
    }
}

function b3dmToMesh(data, layer, url) {
    const urlBase = THREE.LoaderUtils.extractUrlBase(url);
    const options = {
        gltfUpAxis: layer.asset.gltfUpAxis,
        urlBase,
        overrideMaterials: layer.overrideMaterials,
        doNotPatchMaterial: layer.doNotPatchMaterial,
        opacity: layer.opacity,
    };
    return B3dmParser.parse(data, options).then(result => {
        const { batchTable } = result;
        const object3d = result.gltf.scene;
        return { batchTable, object3d };
    });
}

function pntsParse(data, layer) {
    return PntsParser.parse(data).then(result => {
        const material = layer.material
            ? layer.material.clone()
            // new PointsMaterial({ size: 3 });
            : new PointsMaterial();

        if (material.enablePicking) {
            Picking.preparePointGeometryForPicking(result.point.geometry);
        }

        // creation points with geometry and material
        const points = new Points(layer, result.point.geometry, material);

        if (result.point.offset) {
            points.position.copy(result.point.offset);
        }

        return { object3d: points };
    });
}

export function configureTile(tile, layer, metadata, parent) {
    tile.frustumCulled = false;
    tile.layer = layer;

    // parse metadata
    if (metadata.transform) {
        tile.applyMatrix4(metadata.transform);
    }
    tile.geometricError = metadata.geometricError;
    tile.tileId = metadata.tileId;
    if (metadata.refine) {
        tile.additiveRefinement = (metadata.refine.toUpperCase() === 'ADD');
    } else {
        tile.additiveRefinement = parent ? (parent.additiveRefinement) : false;
    }
    tile.viewerRequestVolume = metadata.viewerRequestVolume;
    tile.boundingVolume = metadata.boundingVolume;
    if (tile.boundingVolume.region) {
        tile.add(tile.boundingVolume.region);
    }
    tile.distance = {};
    tile.updateMatrixWorld();
}

function executeCommand(command) {
    const { layer } = command;
    const { metadata } = command;
    const tile = new THREE.Object3D();
    configureTile(tile, layer, metadata, command.requester);
    // Patch for supporting 3D Tiles pre 1.0 (metadata.content.url) and 1.0
    // (metadata.content.uri)
    let path;
    if (metadata.content) {
        if (metadata.content.url) { // 3D Tiles pre 1.0 version
            path = metadata.content.url;
        } else { // 3D Tiles 1.0 version
            path = metadata.content.uri;
        }
    }

    const setLayer = obj => {
        obj.layers.set(layer.threejsLayer);
        obj.userData.metadata = metadata;
        obj.layer = layer;
    };
    if (path) {
        // Check if we have relative or absolute url (with tileset's lopocs for example)
        const url = path.startsWith('http') ? path : metadata.baseURL + path;
        const supportedFormats = {
            b3dm: b3dmToMesh,
            pnts: pntsParse,
        };
        const dl = Cache.get(url)
            || Cache.set(url, Fetcher.arrayBuffer(url, layer.networkOptions), Cache.TEXTURE);
        return dl.then(result => {
            if (result !== undefined) {
                let func;
                const magic = utf8Decoder.decode(new Uint8Array(result, 0, 4));
                metadata.magic = magic;
                if (magic[0] === '{') {
                    result = JSON.parse(utf8Decoder.decode(new Uint8Array(result)));
                    const newPrefix = url.slice(0, url.lastIndexOf('/') + 1);
                    layer.tileIndex.extendTileset(result, metadata.tileId, newPrefix);
                } else if (magic === 'b3dm') {
                    func = supportedFormats.b3dm;
                } else if (magic === 'pnts') {
                    func = supportedFormats.pnts;
                } else {
                    return Promise.reject(new Error(`Unsupported magic code ${magic}`));
                }
                if (func) {
                    // TODO: request should be delayed if there is a viewerRequestVolume
                    return func(result, layer, url).then(content => {
                        tile.content = content.object3d;
                        if (content.batchTable) {
                            tile.batchTable = content.batchTable;
                        }
                        tile.add(content.object3d);
                        tile.traverse(setLayer);
                        return tile;
                    });
                }
            }
            tile.traverse(setLayer);
            return tile;
        });
    }
    tile.traverse(setLayer);
    return Promise.resolve(tile);
}

export default {
    preprocessDataLayer,
    executeCommand,
};
