import * as THREE from 'three';
import B3dmParser from '../Parser/B3dmParser';
import PntsParser from '../Parser/PntsParser';
import Fetcher from './Fetcher';
import { pre3dTilesUpdate, process3dTilesNode, init3dTilesLayer } from '../Process/3dTilesProcessing';
import utf8Decoder from '../utils/Utf8Decoder';
import Picking from '../Core/Picking';
import Points from '../Core/Points';
import PointsMaterial from '../Renderer/PointsMaterial';
import Cache from '../Core/Scheduler/Cache';

const identity = new THREE.Matrix4();
export function $3dTilesIndex(tileset, baseURL) {
    let counter = 1;
    this.index = {};
    const inverseTileTransform = new THREE.Matrix4();
    const recurse = function recurse_f(node, baseURL, parent) {
        // compute transform (will become Object3D.matrix when the object is downloaded)
        node.transform = node.transform ? (new THREE.Matrix4()).fromArray(node.transform) : identity;

        // The only reason to store _worldFromLocalTransform is because of extendTileset where we need the
        // transform chain for one node.
        node._worldFromLocalTransform = node.transform;
        if (parent && parent._worldFromLocalTransform) {
            if (node.transform) {
                node._worldFromLocalTransform = new THREE.Matrix4().multiplyMatrices(
                    parent._worldFromLocalTransform, node.transform);
            } else {
                node._worldFromLocalTransform = parent._worldFromLocalTransform;
            }
        }

        // inverseTileTransform.getInverse(node._worldFromLocalTransform);
        // getBox only use inverseTileTransform for volume.region so let's not
        // compute the inverse matrix each time
        if (node._worldFromLocalTransform) {
            inverseTileTransform.getInverse(node._worldFromLocalTransform);
        } else {
            inverseTileTransform.identity();
        }

        node.viewerRequestVolume = node.viewerRequestVolume ? getBox(node.viewerRequestVolume, inverseTileTransform) : undefined;
        node.boundingVolume = getBox(node.boundingVolume, inverseTileTransform);
        node.refine = node.refine || (parent ? parent.refine : 'ADD');

        this.index[counter] = node;
        node.tileId = counter;
        node.baseURL = baseURL;
        counter++;
        if (node.children) {
            for (const child of node.children) {
                try {
                    recurse(child, baseURL, node);
                } catch (error) {
                    node.children[node.children.indexOf(child)] = undefined;
                }
            }
            const count = node.children.length;
            node.children = node.children.filter(n => n !== undefined);
            if (node.children.length != count) {
                // console.log('Removed elements:', count - node.children.length);
            }
        }
    }.bind(this);
    recurse(tileset.root, baseURL);

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

    this.extendTileset = function extendTileset(tileset, nodeId, baseURL) {
        recurse(tileset.root, baseURL, this.index[nodeId]);
        this.index[nodeId].children = [tileset.root];
        this.index[nodeId].isTileset = true;
    };
}

export function getObjectToUpdateForAttachedLayers(meta) {
    if (meta.content) {
        const result = [];
        meta.content.traverse(obj => {
            if (obj.isObject3D && obj.material && obj.layer == meta.layer) {
                result.push(obj);
            }
        });
        const p = meta.parent;
        if (p && p.content) {
            return {
                elements: result,
                parent: p.content,
            };
        } else {
            return {
                elements: result,
            };
        }
    }
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
        layer.pickObjectsAt = (view, mouse, radius) => Picking.pickPointsAt(view, mouse, radius, layer);
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

        const w = center.x - bbox[3];
        const e = center.x + bbox[3];
        const s = center.y - bbox[7];
        const n = center.y + bbox[7];
        const b = center.z - bbox[11];
        const t = center.z + bbox[11];

        const box = new THREE.Box3(new THREE.Vector3(w, s, b), new THREE.Vector3(e, n, t));
        if (box.getSize(new THREE.Vector3()).length() == 0) {
            throw new Error('Invalid boundingVolume (0 sized box)');
        }
        return { box };
    } else if (volume.sphere) {
        const sphere = new THREE.Sphere(new THREE.Vector3(volume.sphere[0], volume.sphere[1], volume.sphere[2]), volume.sphere[3]);
        return { sphere };
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
        const batchTable = result.batchTable;
        const object3d = result.gltf.scene;
        return { batchTable, object3d };
    });
}

function pntsParse(data, layer) {
    return PntsParser.parse(data).then(result => {
        const material = layer.material ?
            layer.material.clone() :
            // new PointsMaterial({ size: 3 });
            new PointsMaterial();

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
        tile.applyMatrix(metadata.transform);
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
    tile.updateMatrixWorld();
}

function executeCommand(command) {
    const layer = command.layer;
    const metadata = command.metadata;
    const tile = new THREE.Object3D();
    configureTile(tile, layer, metadata, command.requester);
    // Patch for supporting 3D Tiles pre 1.0 (metadata.content.url) and 1.0
    // (metadata.content.uri)
    let path;
    if (metadata.content) {
        if (metadata.content.url) { // 3D Tiles pre 1.0 version
            path = metadata.content.url;
        }
        else { // 3D Tiles 1.0 version
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
        const dl = Cache.get(url) || Cache.set(url, Fetcher.arrayBuffer(url, layer.networkOptions), Cache.TEXTURE);
        return dl.then(result => {
            if (result !== undefined) {
                let func;
                const magic = utf8Decoder.decode(new Uint8Array(result, 0, 4));
                metadata.magic = magic;
                if (magic[0] === '{') {
                    result = JSON.parse(utf8Decoder.decode(new Uint8Array(result)));
                    const newPrefix = url.slice(0, url.lastIndexOf('/') + 1);
                    layer.tileIndex.extendTileset(result, metadata.tileId, newPrefix);
                } else if (magic == 'b3dm') {
                    func = supportedFormats.b3dm;
                } else if (magic == 'pnts') {
                    func = supportedFormats.pnts;
                } else {
                    return Promise.reject(`Unsupported magic code ${magic}`);
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
    } else {
        tile.traverse(setLayer);
        return Promise.resolve(tile);
    }
}

export default {
    preprocessDataLayer,
    executeCommand,
};
