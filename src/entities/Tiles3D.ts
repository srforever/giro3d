import {
    Vector2,
    MathUtils,
    Group,
    Matrix4,
    type Object3D,
    type Material,
    type BufferGeometry,
    Vector3,
} from 'three';
import type Extent from '../core/geographic/Extent';
import Picking, { type PickObjectsAtOptions, type PickResultBase } from '../core/Picking';
import Entity3D from './Entity3D';
import OperationCounter from '../core/OperationCounter';
import $3dTilesIndex, { type TileSet } from './3dtiles/3dTilesIndex';
import Fetcher from '../utils/Fetcher';
import utf8Decoder from '../utils/Utf8Decoder.js';
import { GlobalCache } from '../core/Cache';
import type RequestQueue from '../core/RequestQueue';
import { DefaultQueue } from '../core/RequestQueue';
import { type Tiles3DSource } from '../sources';
import { type ObjectToUpdate } from '../core/MainLoop';
import { type Context } from '../core';
import Tile from './3dtiles/Tile';
import { boundingVolumeToExtent, cullingTest } from './3dtiles/BoundingVolume';
import type { $3dTilesTileset, $3dTilesTile, $3dTilesAsset } from './3dtiles/3dTilesSpec';
import $3dTilesLoader from './3dtiles/3dTilesLoader';

/** Options to create a Tiles3D object. */
export interface Tiles3DOptions {
    /**
     * The delay, in milliseconds, to cleanup unused objects.
     *
     * @default 1000
     */
    cleanupDelay?: number,
    /**
     * The Screen Space Error (SSE) threshold to use for this tileset.
     *
     * @default 16
     */
    sseThreshold?: number,
    /**
     * The optional 3d object to use as the root object of this entity.
     * If none provided, a new one will be created.
     */
    object3d?: Object3D,
    /** The optional material to use. */
    material?: Material,
}

const tmpVector = new Vector3();
const tmpMatrix = new Matrix4();

// This function is used to cleanup a Object3D hierarchy.
// (no 3dtiles spectific code here because this is managed by cleanup3dTileset)
function _cleanupObject3D(n: Object3D): void {
    // @ts-ignore
    if (__DEBUG__) {
        if ((n as any).tileId) {
            throw new Error(`_cleanupObject3D must not be called on a 3dtiles tile (tileId = ${(n as any).tileId})`);
        }
    }
    // all children of 'n' are raw Object3D
    for (const child of n.children) {
        _cleanupObject3D(child);
    }

    if ('dispose' in n && typeof n.dispose === 'function') {
        n.dispose();
    } else {
        // free resources
        if ('material' in n && n.material) {
            (n.material as Material).dispose();
        }
        if ('geometry' in n && n.geometry) {
            (n.geometry as BufferGeometry).dispose();
        }
    }
    n.remove(...n.children);
}

function isTilesetContentReady(tileset: $3dTilesTile, node: Tile): boolean {
    return tileset && node // is tileset loaded ?
        && node.children.length === 1 // is tileset root loaded ?
        && node.children[0].children.length > 0;
}

/**
 * A [3D Tiles](https://www.ogc.org/standards/3DTiles) dataset.
 *
 */
class Tiles3D extends Entity3D {
    /** Read-only flag to check if a given object is of type Tiles3D. */
    readonly isTiles3D = true;
    readonly url: string;
    readonly networkOptions: RequestInit;
    sseThreshold: number;
    cleanupDelay: number;
    material?: Material;
    cleanableTiles: any[];
    private _opCounter: OperationCounter;
    queue: RequestQueue;
    imageSize: Vector2;
    tileset?: $3dTilesTileset;
    tileIndex?: $3dTilesIndex;
    asset?: $3dTilesAsset;
    root?: Tile;
    extent?: Extent;
    wireframe?: boolean;

    /**
     * Constructs a Tiles3D object.
     *
     * @param id The unique identifier of the entity.
     * @param source The data source.
     * @param options Optional properties.
     */
    constructor(id: string, source: Tiles3DSource, options: Tiles3DOptions = {}) {
        super(id, options.object3d || new Group());

        if (!source) {
            throw new Error('missing source');
        }

        if (!source.url) {
            throw new Error('missing source.url');
        }

        this.type = 'Tiles3D';
        this.url = source.url;
        this.networkOptions = source.networkOptions;
        this.sseThreshold = options.sseThreshold ?? 16;
        this.cleanupDelay = options.cleanupDelay ?? 1000;
        this.material = options.material ?? undefined;

        this.cleanableTiles = [];

        this._opCounter = new OperationCounter();

        this.queue = DefaultQueue;
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

    async preprocess(): Promise<void> {
        this.imageSize = new Vector2(128, 128);

        // Download the root tileset to complete the preparation.
        const tileset = await Fetcher.json(this.url, this.networkOptions);
        if (!tileset.root.refine) {
            tileset.root.refine = tileset.refine;
        }

        // Add a tile which acts as root of the tileset but has no content.
        // This way we can safely cleanup the root of the tileset in the processing
        // code, and keep a valid layer.root tile.
        const fakeroot: $3dTilesTile = {
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
        // Note: Constructing $3dTilesIndex makes tileset.root become a TileSet object !
        this.tileIndex = new $3dTilesIndex(tileset, urlPrefix);
        this.asset = tileset.asset;

        const tile = await this.requestNewTile(this.tileset.root as TileSet, undefined, true);
        delete this.tileset;

        this.object3d.add(tile);
        tile.updateMatrixWorld();

        this.tileIndex.index[tile.tileId].obj = tile;
        this.root = tile;
        this.extent = boundingVolumeToExtent(
            this._instance.referenceCrs,
            tile.boundingVolume,
            tile.matrixWorld,
        );
    }

    /* eslint-disable class-methods-use-this */
    getObjectToUpdateForAttachedLayers(meta: any): ObjectToUpdate | null {
        if (!meta.content) {
            return null;
        }
        const result: any[] = [];
        meta.content.traverse((obj: any) => {
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

    pickObjectsAt(
        coordinates: Vector2,
        options?: PickObjectsAtOptions,
        target?: PickResultBase[],
    ): PickResultBase[] {
        // If this is a pointcloud but with no default material defined,
        // we don't go in that if, but we could.
        // TODO: find a better way to know that this layer is about pointcloud ?
        if (this.material && (this.material as any).enablePicking) {
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    requestNewTile(metadata: TileSet, parent?: Tile, _redraw = false) {
        if (metadata.obj) {
            const tileset = metadata as TileSet;
            this.unmarkTileForDeletion(tileset.obj);
            this._instance.notifyChange(parent);
            return Promise.resolve(tileset.obj);
        }

        this._opCounter.increment();

        let priority;
        if (!parent || parent.additiveRefinement) {
            // Additive refinement can be done independently for each child,
            // so we can compute a per child priority
            const size = metadata.boundingVolumeObject.box.clone()
                .applyMatrix4(metadata._worldFromLocalTransform)
                .getSize(tmpVector);
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
                .getSize(tmpVector);
            priority = size.x * size.y;// / this.tileIndex.index[parent.tileId].children.length;
        }

        const request = {
            id: MathUtils.generateUUID(),
            priority,
            shouldExecute: () => this.shouldExecute(parent),
            request: () => this.executeCommand(metadata, parent),
        };

        return this.queue
            .enqueue(request)
            .then((node: Tile) => {
                metadata.obj = node;
                this._instance.notifyChange(this);
                return node;
            }).finally(() => this._opCounter.decrement());
    }

    preUpdate(): Tile[] {
        if (!this.visible) {
            return [];
        }

        // Elements removed are added in the this._cleanableTiles list.
        // Since we simply push in this array, the first item is always
        // the oldest one.
        const now = Date.now();
        if (this.cleanableTiles.length
            && (now - this.cleanableTiles[0].cleanableSince) > this.cleanupDelay) {
            while (this.cleanableTiles.length) {
                const elt = this.cleanableTiles[0];
                if ((now - elt.cleanableSince) > this.cleanupDelay) {
                    this.cleanup3dTileset(elt);
                } else {
                    // later entries are younger
                    break;
                }
            }
        }

        return [this.root];
    }

    update(context: Context, node: Tile): Tile[] {
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
            this.unmarkTileForDeletion(node);

            // We need distance for 2 things:
            // - subdivision testing
            // - near / far calculation in MainLoop. For this one, we need the distance for *all*
            // displayed tiles.
            // For this last reason, we need to calculate this here, and not in subdivisionControl
            node.calculateCameraDistance(context.camera.camera3D);

            if (!this.frozen) {
                if (node.pendingSubdivision || this.subdivisionTest(context, node)) {
                    this.subdivideNode(context, node);
                    // display iff children aren't ready
                    if (node.additiveRefinement || node.pendingSubdivision) {
                        node.setDisplayed(true);
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
                            node.setDisplayed(allReady);
                        } else {
                            node.setDisplayed(true);
                        }
                    }
                    returnValue = node.getChildTiles();
                } else {
                    node.setDisplayed(true);

                    for (const n of node.getChildTiles()) {
                        n.visible = false;
                        this.markTileForDeletion(n);
                    }
                }
            } else {
                returnValue = node.getChildTiles();
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
                    if ((o as any).layer === this && (o as any).material) {
                        (o as any).material.wireframe = this.wireframe;
                        if ('isPoints' in o && o.isPoints) {
                            const ptsMaterial = (o as any).material as Material;
                            if ('update' in ptsMaterial && typeof ptsMaterial.update === 'function') {
                                ptsMaterial.update(this.material);
                            } else {
                                ptsMaterial.copy(this.material);
                            }
                        }
                    }
                });
            }
        } else if (node !== this.root) {
            if (node.parent && node.parent.additiveRefinement) {
                this.markTileForDeletion(node);
            }
        }

        return returnValue;
    }

    markTileForDeletion(node: Tile) {
        if (!node.cleanableSince) {
            node.markForDeletion();
            this.cleanableTiles.push(node);
        }
    }

    unmarkTileForDeletion(node: Tile) {
        if (node.cleanableSince) {
            this.cleanableTiles.splice(this.cleanableTiles.indexOf(node), 1);
            node.unmarkForDeletion();
        }
    }

    // Cleanup all 3dtiles|three.js starting from a given node n.
    // n's children can be of 2 types:
    //   - have a 'content' attribute -> it's a tileset and must
    //     be cleaned with cleanup3dTileset()
    //   - doesn't have 'content' -> it's a raw Object3D object,
    //     and must be cleaned with _cleanupObject3D()
    cleanup3dTileset(n: Tile, depth: number = 0): void {
        this.unmarkTileForDeletion(n);

        if (this.tileIndex.index[n.tileId].obj) {
            this.tileIndex.index[n.tileId].obj.deleted = Date.now();
            this.tileIndex.index[n.tileId].obj = undefined;
        }

        // clean children tiles recursively
        for (const child of n.getChildTiles()) {
            this.cleanup3dTileset(child, depth + 1);
            n.remove(child);
        }

        if (n.content) {
            // clean content
            n.content.traverse(_cleanupObject3D);
            n.remove(n.content);
            delete n.content;
        }

        if ('dispose' in n && typeof n.dispose === 'function') {
            n.dispose();
        }

        // and finally remove from parent
        // if (depth === 0 && n.parent) {
        //     n.parent.remove(n);
        // }
    }

    subdivisionTest(context: Context, node: Tile): boolean {
        if (this.tileIndex.index[node.tileId].children === undefined) {
            return false;
        }
        if (this.tileIndex.index[node.tileId].isTileset) {
            return true;
        }

        const sse = node.computeNodeSSE(context.camera);
        node.sse = sse;

        return sse > this.sseThreshold;
    }

    subdivideNodeAdditive(context: Context, node: Tile): void {
        for (const child of this.tileIndex.index[node.tileId].children) {
            // child being downloaded or already added => skip
            if (child.promise || node.children.filter(n => n.tileId === child.tileId).length > 0) {
                continue;
            }

            // 'child' is only metadata (it's *not* a Object3D). 'cullingTest' needs
            // a matrixWorld, so we compute it: it's node's matrixWorld x child's transform
            let overrideMatrixWorld = node.matrixWorld;
            if (child.transformMatrix) {
                overrideMatrixWorld = tmpMatrix.multiplyMatrices(
                    node.matrixWorld, child.transformMatrix,
                );
            }

            const isVisible = !cullingTest(context.camera, child, overrideMatrixWorld);

            // child is not visible => skip
            if (!isVisible) {
                continue;
            }

            child.promise = this.requestNewTile(child, node, true)
                .then(tile => {
                    if (!tile || !node.parent) {
                        // cancelled promise or node has been deleted
                    } else {
                        node.add(tile);
                        tile.updateMatrixWorld();

                        const extent = boundingVolumeToExtent(
                            this.extent.crs(), tile.boundingVolume, tile.matrixWorld,
                        );
                        tile.traverse((obj: any) => {
                            obj.extent = extent;
                        });

                        this._instance.notifyChange(child);
                    }
                    delete child.promise;
                }, () => {
                    delete child.promise;
                });
        }
    }

    subdivideNodeSubstractive(node: Tile): void {
        // Subdivision in progress => nothing to do
        if (node.pendingSubdivision) {
            return;
        }

        if (node.getChildTiles().length > 0) {
            return;
        }
        // No child => nothing to do either
        const childrenTiles = this.tileIndex.index[node.tileId].children;
        if (childrenTiles === undefined || childrenTiles.length === 0) {
            return;
        }

        node.pendingSubdivision = true;

        // Substractive (refine = 'REPLACE') is an all or nothing subdivision mode
        const promises = [];
        for (const child of this.tileIndex.index[node.tileId].children) {
            const p = this.requestNewTile(child, node, false).then(tile => {
                node.add(tile);
                tile.updateMatrixWorld();

                const extent = boundingVolumeToExtent(
                    this.extent.crs(), tile.boundingVolume, tile.matrixWorld,
                );
                tile.traverse((obj: any) => {
                    obj.extent = extent;
                });
            });
            promises.push(p);
        }

        Promise.all(promises).then(() => {
            node.pendingSubdivision = false;
            this._instance.notifyChange(node);
        }, () => {
            node.pendingSubdivision = false;

            // delete other children
            for (const n of node.getChildTiles()) {
                n.visible = false;
                this.markTileForDeletion(n);
            }
        });
    }

    subdivideNode(context: Context, node: Tile): void {
        if (node.additiveRefinement) {
            // Additive refinement can only fetch visible children.
            this.subdivideNodeAdditive(context, node);
        } else {
            // Substractive refinement on the other hand requires to replace
            // node with all of its children
            this.subdivideNodeSubstractive(node);
        }
    }

    async executeCommand(
        metadata: TileSet,
        requester?: Tile,
    ): Promise<Tile> {
        const tile = new Tile(this, metadata, requester);

        // Patch for supporting 3D Tiles pre 1.0 (metadata.content.url) and 1.0
        // (metadata.content.uri)
        let path: string;
        if (metadata.content) {
            if (metadata.content.url) { // 3D Tiles pre 1.0 version
                path = metadata.content.url;
            } else { // 3D Tiles 1.0 version
                path = metadata.content.uri;
            }
        }

        const setupObject = (obj: any) => {
            obj.userData.metadata = metadata;
            obj.layer = this;
            this.onObjectCreated(obj);
        };
        if (path) {
            // Check if we have relative or absolute url (with tileset's lopocs for example)
            const url = path.startsWith('http') ? path : metadata.baseURL + path;
            const dl = (GlobalCache.get(url)
                    || GlobalCache.set(url, Fetcher.arrayBuffer(url, this.networkOptions))
            ) as Promise<ArrayBuffer>;

            const result = await dl;
            if (result !== undefined) {
                let content;
                const magic = utf8Decoder.decode(new Uint8Array(result, 0, 4));
                metadata.magic = magic;
                if (magic[0] === '{') {
                    const { newTileset, newPrefix } = await $3dTilesLoader.jsonParse(
                        result, this, url,
                    );
                    this.tileIndex.extendTileset(newTileset, metadata.tileId, newPrefix);
                } else if (magic === 'b3dm') {
                    content = await $3dTilesLoader.b3dmToMesh(result, this, url);
                } else if (magic === 'pnts') {
                    content = await $3dTilesLoader.pntsParse(result, this);
                } else {
                    throw new Error(`Unsupported magic code ${magic}`);
                }

                if (content) {
                    // TODO: request should be delayed if there is a viewerRequestVolume
                    tile.content = content.object3d;
                    content.object3d.name = path;

                    if ('batchTable' in content && content.batchTable) {
                        tile.batchTable = content.batchTable;
                    }
                    tile.add(content.object3d);
                    tile.traverse(setupObject);
                    return tile;
                }
            }
            tile.traverse(setupObject);
            return tile;
        }
        tile.traverse(setupObject);
        return tile;
    }

    /**
     * @param node The tile to evaluate;
     * @returns true if the request can continue, false if it must be cancelled.
     */
    shouldExecute(node: Tile): boolean {
        if (!node) { return true; }

        // node was removed from the hierarchy
        if (!node.parent) { return false; }

        // tile not visible anymore
        if (!node.visible) { return false; }

        // tile visible but doesn't need subdivision anymore
        if (node.sse < this.sseThreshold) { return false; }

        return true;
    }
}

export default Tiles3D;

export {
    boundingVolumeToExtent,
};
