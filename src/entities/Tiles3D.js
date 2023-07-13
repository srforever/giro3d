/**
 * @module entities/Tiles3D
 */
import {
    Vector2,
    Vector3,
    Box3,
    Sphere,
    LoaderUtils,
    MathUtils,
    Group,
    Matrix4,
    Object3D,
} from 'three';
import Extent from '../core/geographic/Extent.js';
import Picking from '../core/Picking.js';
import ScreenSpaceError from '../core/ScreenSpaceError.js';
import Entity3D from './Entity3D.js';
import OperationCounter from '../core/OperationCounter';
import $3dTilesIndex from './3dtiles/3dTilesIndex.js';
import Fetcher from '../utils/Fetcher.js';
import utf8Decoder from '../utils/Utf8Decoder.js';
import { GlobalCache } from '../core/Cache.js';
import B3dmParser from '../parser/B3dmParser.js';
import PntsParser from '../parser/PntsParser.js';
import PointCloud from '../core/PointCloud.js';
import PointsMaterial from '../renderer/PointsMaterial.js';

const tmp = {
    v: new Vector3(),
    b: new Box3(),
    s: new Sphere(),
};

/**
 * Options to create a Tiles3D object.
 *
 * @typedef {object} Options
 * @property {number} [cleanupDelay=1000] The delay, in milliseconds,
 * to cleanup unused objects.
 * @property {number} [sseThreshold=16] The Screen Space Error (SSE) threshold
 * to use for this tileset.
 * @property {module:THREE.Object3D} [object3d=new Group()] The optional 3d object to use
 * as the root object of this entity. If none provided, a new one will be created.
 * @property {module:THREE.Material} [material=undefined] The optional material to use.
 */

/**
 * A [3D Tiles](https://www.ogc.org/standards/3DTiles) dataset.
 *
 * @api
 */
class Tiles3D extends Entity3D {
    /**
     * Constructs a Tiles3D object.
     *
     * @param {string} id The unique identifier of the entity.
     * @param {module:sources/Tiles3DSource~Tiles3DSource} source The data source.
     * @param {Options} [options={}] Optional properties.
     * @api
     */
    constructor(id, source, options = {}) {
        super(id, options.object3d || new Group());

        if (!source) {
            throw new Error('missing source');
        }

        if (!source.url) {
            throw new Error('missing source.url');
        }

        /**
         * Read-only flag to check if a given object is of type Tiles3D.
         *
         * @type {boolean}
         * @api
         */
        this.isTiles3D = true;
        /** @type {string} */
        this.type = 'Tiles3D';
        /** @type {string} */
        this.url = source.url;
        /** @type {object} */
        this.networkOptions = source.networkOptions;
        /** @type {number} */
        this.sseThreshold = options.sseThreshold || 16;
        /** @type {number} */
        this.cleanupDelay = options.cleanupDelay || 1000;
        /** @type {module:THREE.Material} */
        this.material = options.material || undefined;

        /** @type {Array} */
        this._cleanableTiles = [];

        this._opCounter = new OperationCounter();
    }

    get loading() {
        return this._opCounter.loading || this._attachedLayers.some(l => l.loading);
    }

    get progress() {
        let sum = this._opCounter.progress;
        sum = this._attachedLayers.reduce((accum, current) => accum + current.progress, sum);
        return sum / (this._attachedLayers.length + 1);
    }

    updateOpacity() {
        if (this.material) {
            // This is necessary because update() does copy the material's properties
            // to the tile's material, and we are losing any custom opacity.
            this.material.opacity = this.opacity;
            this.material.transparent = this.opacity < 1;
        }
        super.updateOpacity();
    }

    preprocess() {
        this.imageSize = new Vector2(128, 128);
        // Download the root tileset to complete the preparation.
        return Fetcher.json(this.url, this.networkOptions).then(tileset => {
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
            this.tileset = tileset;
            const urlPrefix = this.url.slice(0, this.url.lastIndexOf('/') + 1);
            this.tileIndex = new $3dTilesIndex(tileset, urlPrefix);
            this.asset = tileset.asset;
            return this.requestNewTile(this.tileset.root, undefined, true).then(
                tile => {
                    delete this.tileset;
                    this.object3d.add(tile);
                    tile.updateMatrixWorld();
                    this.tileIndex.index[tile.tileId].obj = tile;
                    this.root = tile;
                    this.extent = boundingVolumeToExtent(
                        this.projection || this._instance.referenceCrs,
                        tile.boundingVolume,
                        tile.matrixWorld,
                    );
                },
            );
        });
    }

    /* eslint-disable class-methods-use-this */
    getObjectToUpdateForAttachedLayers(meta) {
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
    /* eslint-enable class-methods-use-this */

    pickObjectsAt(coordinates, options, target) {
        // If this is a pointcloud but with no default material defined,
        // we don't go in that if, but we could.
        // TODO: find a better way to know that this layer is about pointcloud ?
        if (this.material && this.material.enablePicking) {
            return Picking.pickPointsAt(
                this._instance,
                coordinates,
                this,
                options,
                target,
            );
        }
        return super.pickObjectsAt(coordinates, options, target);
    }

    requestNewTile(metadata, parent, redraw) {
        if (metadata.obj) {
            unmarkForDeletion(this, metadata.obj);
            this._instance.notifyChange(parent);
            return Promise.resolve(metadata.obj);
        }

        this._opCounter.increment();

        let priority;
        if (!parent || parent.additiveRefinement) {
            // Additive refinement can be done independently for each child,
            // so we can compute a per child priority
            const size = metadata.boundingVolume.box.clone()
                .applyMatrix4(metadata._worldFromLocalTransform)
                .getSize(tmp.v);
            priority = size.x * size.y;
        } else {
            // But the 'replace' refinement needs to download all children at
            // the same time.
            // If one of the children is very small, its priority will be low,
            // and it will delay the display of its siblings.
            // So we compute a priority based on the size of the parent
            // TODO cache the computation of world bounding volume ?
            const size = parent.boundingVolume.box.clone()
                .applyMatrix4(parent.matrixWorld)
                .getSize(tmp.v);
            priority = size.x * size.y;// / this.tileIndex.index[parent.tileId].children.length;
        }

        const command = {
            /* mandatory */
            instance: this._instance,
            requester: parent,
            layer: this,
            priority,
            /* specific params */
            redraw,
            earlyDropFunction: () => parent
            && (
                // requester cleaned
                !parent.parent
                // requester not visible anymore
                || !parent.visible
                // requester visible but doesn't need subdivision anymore
                || parent.sse < this.sseThreshold
            ),
            fn: () => executeCommand(this, metadata, parent),
        };

        if (metadata.content) {
            const path = metadata.content.url || metadata.content.uri;
            const url = path.startsWith('http') ? path : metadata.baseURL + path;

            command.toDownload = { url };
        }

        return this._instance.mainLoop.scheduler
            .execute(command)
            .then(node => {
                metadata.obj = node;
                return node;
            }).finally(() => this._opCounter.decrement());
    }

    preUpdate() {
        if (!this.visible) {
            return [];
        }

        // Elements removed are added in the this._cleanableTiles list.
        // Since we simply push in this array, the first item is always
        // the oldest one.
        const now = Date.now();
        if (this._cleanableTiles.length
            && (now - this._cleanableTiles[0].cleanableSince) > this.cleanupDelay) {
            while (this._cleanableTiles.length) {
                const elt = this._cleanableTiles[0];
                if ((now - elt.cleanableSince) > this.cleanupDelay) {
                    cleanup3dTileset(this, elt);
                } else {
                    // later entries are younger
                    break;
                }
            }
        }

        return [this.root];
    }

    update(context, node) {
        // Remove deleted children (?)
        node.remove(...node.children.filter(c => c.deleted));

        // early exit if parent's subdivision is in progress
        if (node.parent.pendingSubdivision && !node.parent.additiveRefinement) {
            node.visible = false;
            return undefined;
        }
        let returnValue;

        // do proper culling
        const isVisible = !cullingTest(context.camera, node, node.matrixWorld);
        node.visible = isVisible;

        if (isVisible) {
            unmarkForDeletion(this, node);

            // We need distance for 2 things:
            // - subdivision testing
            // - near / far calculation in MainLoop. For this one, we need the distance for *all*
            // displayed tiles.
            // For this last reason, we need to calculate this here, and not in subdivisionControl
            calculateCameraDistance(context.camera.camera3D, node);
            if (node.pendingSubdivision || subdivisionTest(context, this, node)) {
                subdivideNode(context, this, node, cullingTest);
                // display iff children aren't ready
                if (node.additiveRefinement || node.pendingSubdivision) {
                    setDisplayed(node, true);
                } else {
                    // If one of our child is a tileset, this node must be displayed until this
                    // child content is ready, to avoid hiding our content too early (= when our
                    // child is loaded but its content is not)
                    const subtilesets = this.tileIndex.index[node.tileId].children.filter(
                        tile => tile.isTileset,
                    );

                    if (subtilesets.length) {
                        let allReady = true;
                        for (const tileset of subtilesets) {
                            const subTilesetNode = node.children.filter(
                                n => n.tileId === tileset.tileId,
                            )[0];
                            if (!isTilesetContentReady(tileset, subTilesetNode)) {
                                allReady = false;
                                break;
                            }
                        }
                        setDisplayed(node, allReady);
                    } else {
                        setDisplayed(node, true);
                    }
                }
                returnValue = getChildTiles(node);
            } else {
                setDisplayed(node, true);

                for (const n of getChildTiles(node)) {
                    n.visible = false;
                    markForDeletion(this, n);
                }
            }
            // update material
            if (node.content && node.content.visible) {
                // it will therefore contribute to near / far calculation
                if (node.boundingVolume.region) {
                    throw new Error('boundingVolume.region is not yet supported');
                } else if (node.boundingVolume.box) {
                    this._distance.min = Math.min(this._distance.min, node.distance.min);
                    this._distance.max = Math.max(this._distance.max, node.distance.max);
                } else if (node.boundingVolume.sphere) {
                    this._distance.min = Math.min(this._distance.min, node.distance.min);
                    this._distance.max = Math.max(this._distance.max, node.distance.max);
                }
                node.content.traverse(o => {
                    if (o.layer === this && o.material) {
                        o.material.wireframe = this.wireframe;
                        if (o.isPoints) {
                            if (o.material.update) {
                                o.material.update(this.material);
                            } else {
                                o.material.copy(this.material);
                            }
                        }
                    }
                });
            }
        } else if (node !== this.root) {
            if (node.parent && node.parent.additiveRefinement) {
                markForDeletion(this, node);
            }
        }

        return returnValue;
    }
}

function b3dmToMesh(data, entity, url) {
    const urlBase = LoaderUtils.extractUrlBase(url);
    const options = {
        gltfUpAxis: entity.asset.gltfUpAxis,
        urlBase,
        overrideMaterials: entity.overrideMaterials,
        doNotPatchMaterial: entity.doNotPatchMaterial,
        opacity: entity.opacity,
    };
    return B3dmParser.parse(data, options).then(result => {
        const { batchTable } = result;
        const object3d = result.gltf.scene;
        return { batchTable, object3d };
    });
}

function pntsParse(data, entity) {
    return PntsParser.parse(data).then(result => {
        const material = entity.material
            ? entity.material.clone()
            : new PointsMaterial();

        if (material.enablePicking) {
            Picking.preparePointGeometryForPicking(result.point.geometry);
        }

        // creation points with geometry and material
        const points = new PointCloud({
            layer: entity,
            geometry: result.point.geometry,
            material,
            textureSize: entity.imageSize,
        });

        if (result.point.offset) {
            points.position.copy(result.point.offset);
        }

        return { object3d: points };
    });
}

export function configureTile(tile, entity, metadata, parent) {
    tile.frustumCulled = false;
    tile.layer = entity;

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

function executeCommand(entity, metadata, requester) {
    const tile = new Object3D();
    tile.name = '3D tile';

    configureTile(tile, entity, metadata, requester);
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
        obj.userData.metadata = metadata;
        obj.layer = entity;
    };
    if (path) {
        // Check if we have relative or absolute url (with tileset's lopocs for example)
        const url = path.startsWith('http') ? path : metadata.baseURL + path;
        const supportedFormats = {
            b3dm: b3dmToMesh,
            pnts: pntsParse,
        };
        const dl = GlobalCache.get(url)
            || GlobalCache.set(url, Fetcher.arrayBuffer(url, entity.networkOptions));
        return dl.then(result => {
            if (result !== undefined) {
                let func;
                const magic = utf8Decoder.decode(new Uint8Array(result, 0, 4));
                metadata.magic = magic;
                if (magic[0] === '{') {
                    result = JSON.parse(utf8Decoder.decode(new Uint8Array(result)));
                    const newPrefix = url.slice(0, url.lastIndexOf('/') + 1);
                    entity.tileIndex.extendTileset(result, metadata.tileId, newPrefix);
                } else if (magic === 'b3dm') {
                    func = supportedFormats.b3dm;
                } else if (magic === 'pnts') {
                    func = supportedFormats.pnts;
                } else {
                    return Promise.reject(new Error(`Unsupported magic code ${magic}`));
                }
                if (func) {
                    // TODO: request should be delayed if there is a viewerRequestVolume
                    return func(result, entity, url).then(content => {
                        tile.content = content.object3d;
                        content.object3d.name = path;

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

function getChildTiles(tile) {
    // only keep children that have the same layer and a valid tileId
    return tile.children.filter(n => n.layer === tile.layer && n.tileId);
}

function subdivideNode(context, entity, node, cullingTestFn) {
    if (node.additiveRefinement) {
        // Additive refinement can only fetch visible children.
        _subdivideNodeAdditive(context, entity, node, cullingTestFn);
    } else {
        // Substractive refinement on the other hand requires to replace
        // node with all of its children
        _subdivideNodeSubstractive(context, entity, node);
    }
}

function boundingVolumeToExtent(crs, volume, transform) {
    if (volume.region) {
        return new Extent('EPSG:4326',
            MathUtils.radToDeg(volume.region[0]),
            MathUtils.radToDeg(volume.region[2]),
            MathUtils.radToDeg(volume.region[1]),
            MathUtils.radToDeg(volume.region[3]));
    }
    if (volume.box) {
        const box = tmp.b.copy(volume.box).applyMatrix4(transform);
        return Extent.fromBox3(crs, box);
    }
    const sphere = tmp.s.copy(volume.sphere).applyMatrix4(transform);
    return new Extent(crs, {
        west: sphere.center.x - sphere.radius,
        east: sphere.center.x + sphere.radius,
        south: sphere.center.y - sphere.radius,
        north: sphere.center.y + sphere.radius,
    });
}

const tmpMatrix = new Matrix4();
function _subdivideNodeAdditive(ctx, entity, node, cullingTestFn) {
    for (const child of entity.tileIndex.index[node.tileId].children) {
        // child being downloaded or already added => skip
        if (child.promise || node.children.filter(n => n.tileId === child.tileId).length > 0) {
            continue;
        }

        // 'child' is only metadata (it's *not* a Object3D). 'cullingTest' needs
        // a matrixWorld, so we compute it: it's node's matrixWorld x child's transform
        let overrideMatrixWorld = node.matrixWorld;
        if (child.transform) {
            overrideMatrixWorld = tmpMatrix.multiplyMatrices(node.matrixWorld, child.transform);
        }

        const isVisible = cullingTestFn
            ? !cullingTestFn(ctx.camera, child, overrideMatrixWorld) : true;

        // child is not visible => skip
        if (!isVisible) {
            continue;
        }

        child.promise = entity.requestNewTile(child, node, true)
            .then(tile => {
                if (!tile || !node.parent) {
                    // cancelled promise or node has been deleted
                } else {
                    node.add(tile);
                    tile.updateMatrixWorld();

                    const extent = boundingVolumeToExtent(
                        entity.extent.crs(), tile.boundingVolume, tile.matrixWorld,
                    );
                    tile.traverse(obj => {
                        obj.extent = extent;
                    });

                    ctx.instance.notifyChange(child);
                }
                delete child.promise;
            }, () => {
                delete child.promise;
            });
    }
}

function _subdivideNodeSubstractive(context, entity, node) {
    // Subdivision in progress => nothing to do
    if (node.pendingSubdivision) {
        return;
    }

    if (getChildTiles(node).length > 0) {
        return;
    }
    // No child => nothing to do either
    const childrenTiles = entity.tileIndex.index[node.tileId].children;
    if (childrenTiles === undefined || childrenTiles.length === 0) {
        return;
    }

    node.pendingSubdivision = true;

    // Substractive (refine = 'REPLACE') is an all or nothing subdivision mode
    const promises = [];
    for (const child of entity.tileIndex.index[node.tileId].children) {
        const p = entity.requestNewTile(child, node, false).then(tile => {
            node.add(tile);
            tile.updateMatrixWorld();

            const extent = boundingVolumeToExtent(
                entity.extent.crs(), tile.boundingVolume, tile.matrixWorld,
            );
            tile.traverse(obj => {
                obj.extent = extent;
            });
        });
        promises.push(p);
    }

    Promise.all(promises).then(() => {
        node.pendingSubdivision = false;
        context.instance.notifyChange(node);
    }, () => {
        node.pendingSubdivision = false;

        // delete other children
        for (const n of getChildTiles(node)) {
            n.visible = false;
            markForDeletion(entity, n);
        }
    });
}

function cullingTest(camera, node, tileMatrixWorld) {
    // For viewer Request Volume https://github.com/AnalyticalGraphicsInc/3d-tiles-samples/tree/master/tilesets/TilesetWithRequestVolume
    if (node.viewerRequestVolume) {
        const nodeViewer = node.viewerRequestVolume;
        if (nodeViewer.region) {
            // TODO
            return true;
        }
        if (nodeViewer.box) {
            // TODO
            return true;
        }
        if (nodeViewer.sphere) {
            // To check the distance between the center sphere and the camera
            tmp.s.copy(nodeViewer.sphere);
            tmp.s.applyMatrix4(node.matrixWorld);
            if (!(camera.camera3D.position.distanceTo(tmp.s.center) <= tmp.s.radius)) {
                return true;
            }
        }
    }

    // For bounding volume
    if (node.boundingVolume) {
        const { boundingVolume } = node;
        if (boundingVolume.region) {
            return !camera.isBox3Visible(boundingVolume.region.box3D,
                tileMatrixWorld.clone().multiply(boundingVolume.region.matrix));
        }
        if (boundingVolume.box) {
            return !camera.isBox3Visible(boundingVolume.box, tileMatrixWorld);
        }
        if (boundingVolume.sphere) {
            return !camera.isSphereVisible(boundingVolume.sphere, tileMatrixWorld);
        }
    }
    return false;
}

// Cleanup all 3dtiles|three.js starting from a given node n.
// n's children can be of 2 types:
//   - have a 'content' attribute -> it's a tileset and must
//     be cleaned with cleanup3dTileset()
//   - doesn't have 'content' -> it's a raw Object3D object,
//     and must be cleaned with _cleanupObject3D()
function cleanup3dTileset(entity, n, depth = 0) {
    unmarkForDeletion(entity, n);

    if (entity.tileIndex.index[n.tileId].obj) {
        entity.tileIndex.index[n.tileId].obj.deleted = Date.now();
        entity.tileIndex.index[n.tileId].obj = undefined;
    }

    // clean children tiles recursively
    for (const child of getChildTiles(n)) {
        cleanup3dTileset(entity, child, depth + 1);
        n.remove(child);
    }

    if (n.content) {
        // clean content
        n.content.traverse(_cleanupObject3D);
        n.remove(n.content);
        delete n.content;
    }

    if (n.dispose) {
        n.dispose();
    }

    // and finally remove from parent
    // if (depth === 0 && n.parent) {
    //     n.parent.remove(n);
    // }
}

// This function is used to cleanup a Object3D hierarchy.
// (no 3dtiles spectific code here because this is managed by cleanup3dTileset)
function _cleanupObject3D(n) {
    if (__DEBUG__) {
        if (n.tileId) {
            throw new Error(`_cleanupObject3D must not be called on a 3dtiles tile (tileId = ${n.tileId})`);
        }
    }
    // all children of 'n' are raw Object3D
    for (const child of n.children) {
        _cleanupObject3D(child);
    }

    if (n.dispose) {
        n.dispose();
    } else {
        // free resources
        if (n.material) {
            n.material.dispose();
        }
        if (n.geometry) {
            n.geometry.dispose();
        }
    }
    n.remove(...n.children);
}

function computeNodeSSE(context, node) {
    if (node.boundingVolume.region) {
        throw new Error('boundingVolume.region is unsupported');
    } else if (node.boundingVolume.box) {
        const sse = ScreenSpaceError.computeFromBox3(
            context.camera,
            node.boundingVolume.box,
            node.matrixWorld,
            node.geometricError,
            ScreenSpaceError.MODE_3D,
        );

        if (!sse) {
            return Infinity;
        }
        return Math.max(sse.lengths.x, sse.lengths.y);
    } else if (node.boundingVolume.sphere) {
        // TODO this is broken
        if (node.distance === 0) {
            // This test is needed in case geometricError = distance = 0
            return Infinity;
        }
        return context.camera._preSSE * (node.geometricError / node.distance);
    } else {
        // TODO invalid tileset, should we throw?
        return Infinity;
    }
}

function setDisplayed(node, display) {
    // The geometry of the tile is not in node, but in node.content
    // To change the display state, we change node.content.visible instead of
    // node.material.visible
    if (node.content) {
        node.content.visible = display;
    }
}

function markForDeletion(layer, elt) {
    if (!elt.cleanableSince) {
        elt.cleanableSince = Date.now();
        layer._cleanableTiles.push(elt);
    }
}

function unmarkForDeletion(layer, elt) {
    if (elt.cleanableSince) {
        layer._cleanableTiles.splice(layer._cleanableTiles.indexOf(elt), 1);
        elt.cleanableSince = undefined;
    }
}

function isTilesetContentReady(tileset, node) {
    return tileset && node // is tileset loaded ?
        && node.children.length === 1 // is tileset root loaded ?
        && node.children[0].children.length > 0;
}

export function calculateCameraDistance(camera, node) {
    node.distance.min = 0;
    node.distance.max = 0;
    if (node.boundingVolume.region) {
        throw new Error('boundingVolume.region is unsupported');
    } else if (node.boundingVolume.box) {
        // boundingVolume.box is affected by matrixWorld
        tmp.b.copy(node.boundingVolume.box);
        tmp.b.applyMatrix4(node.matrixWorld);
        node.distance.min = tmp.b.distanceToPoint(camera.position);
        // this overestimates the distance a bit
        // it's ok because what we *don't* want is underestimating it and this keeps the calculus
        // fast
        // Maybe we could make it more precise in the future, if big bounding boxes causes trouble
        // with the far plane (but I don't really expect it to do so)
        node.distance.max = node.distance.min + tmp.b.getSize(tmp.v).length();
    } else if (node.boundingVolume.sphere) {
        // boundingVolume.sphere is affected by matrixWorld
        tmp.s.copy(node.boundingVolume.sphere);
        tmp.s.applyMatrix4(node.matrixWorld);
        // TODO: this probably assumes that the camera has no parent
        node.distance.min = Math.max(0.0,
            tmp.s.distanceToPoint(camera.position));
        node.distance.max = node.distance.min + 2 * tmp.s.radius;
    }
}

function subdivisionTest(context, layer, node) {
    if (layer.tileIndex.index[node.tileId].children === undefined) {
        return false;
    }
    if (layer.tileIndex.index[node.tileId].isTileset) {
        return true;
    }

    const sse = computeNodeSSE(context, node);
    node.sse = sse;

    return sse > layer.sseThreshold;
}

export default Tiles3D;
