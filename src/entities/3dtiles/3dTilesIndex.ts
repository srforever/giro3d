import {
    Box3,
    Matrix4,
    Sphere,
    Vector3,
} from 'three';
import type Tile from './Tile';
import { type BoundingVolume } from './BoundingVolume';
import type { $3dTilesTileset, $3dTilesTile, $3dTilesBoundingVolume } from './types';

// TODO: rename Tileset to Tile or something (this object is *not* a Tileset)
/** Processed tile metadata */
export interface Tileset extends $3dTilesTile {
    isTileset: boolean;
    transformMatrix: Matrix4,
    worldFromLocalTransform: Matrix4;
    viewerRequestVolumeObject?: BoundingVolume,
    boundingVolumeObject: BoundingVolume,
    promise?: Promise<void>,

    tileId: number;
    magic?: string,

    obj?: Tile;
    children?: Tileset[],
}

const identity = new Matrix4();

function getBox(
    volume: $3dTilesBoundingVolume,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    inverseTileTransform: Matrix4,
): BoundingVolume {
    if (volume.region) {
        throw new Error('volume.region is unsupported');
    } else if (volume.box) {
        // TODO: only works for axis aligned boxes
        const bbox = volume.box;
        // box[0], box[1], box[2] = center of the box
        // box[3], box[4], box[5] = x axis direction and half-length
        // box[6], box[7], box[8] = y axis direction and half-length
        // box[9], box[10], box[11] = z axis direction and half-length
        const center = new Vector3(bbox[0], bbox[1], bbox[2]);

        const halfXVector = new Vector3(bbox[3], bbox[4], bbox[5]);
        const halfYVector = new Vector3(bbox[6], bbox[7], bbox[8]);
        const halfZVector = new Vector3(bbox[9], bbox[10], bbox[11]);
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

        const box = new Box3(new Vector3(w, s, b), new Vector3(e, n, t));
        if (box.getSize(new Vector3()).length() === 0) {
            throw new Error('Invalid boundingVolume (0 sized box)');
        }
        return { box };
    } else if (volume.sphere) {
        const sphere = new Sphere(
            new Vector3(volume.sphere[0], volume.sphere[1], volume.sphere[2]),
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

/** Tile index */
class $3dTilesIndex {
    private _counter: number;
    /** Map by tileId */
    readonly index: Record<number, Tileset>;
    private _inverseTileTransform: Matrix4;

    constructor(tileset: $3dTilesTileset, baseURL: string) {
        this._counter = 1;
        this.index = {};
        this._inverseTileTransform = new Matrix4();
        this._recurse(tileset.root, baseURL);
    }

    get(tile: Tile): Tileset { return this.index[tile.tileId]; }

    _recurse(node: $3dTilesTile, baseURL: string, parent?: Tileset) {
        const indexedNode = node as Tileset;
        // compute transform (will become Object3D.matrix when the object is downloaded)
        indexedNode.transformMatrix = node.transform
            ? (new Matrix4()).fromArray(node.transform) : identity;

        // The only reason to store _worldFromLocalTransform is because of extendTileset where we
        // need the transform chain for one node.
        indexedNode.worldFromLocalTransform = indexedNode.transformMatrix;
        if (parent && parent.worldFromLocalTransform) {
            if (indexedNode.transform) {
                indexedNode.worldFromLocalTransform = new Matrix4().multiplyMatrices(
                    parent.worldFromLocalTransform, indexedNode.transformMatrix,
                );
            } else {
                indexedNode.worldFromLocalTransform = parent.worldFromLocalTransform;
            }
        }

        // this._inverseTileTransform.copy(node._worldFromLocalTransform).invert();
        // getBox only use this._inverseTileTransform for volume.region so let's not
        // compute the inverse matrix each time
        if (indexedNode.worldFromLocalTransform) {
            this._inverseTileTransform.copy(indexedNode.worldFromLocalTransform).invert();
        } else {
            this._inverseTileTransform.identity();
        }

        indexedNode.viewerRequestVolumeObject = indexedNode.viewerRequestVolume
            ? getBox(indexedNode.viewerRequestVolume, this._inverseTileTransform)
            : undefined;
        indexedNode.boundingVolumeObject = getBox(
            indexedNode.boundingVolume, this._inverseTileTransform,
        );
        indexedNode.refine = indexedNode.refine || (parent ? parent.refine : 'ADD');

        this.index[this._counter] = indexedNode;
        indexedNode.tileId = this._counter;
        indexedNode.baseURL = baseURL;
        this._counter++;
        if (indexedNode.children) {
            for (const child of indexedNode.children) {
                try {
                    this._recurse(child, baseURL, indexedNode);
                } catch (error) {
                    indexedNode.children[node.children.indexOf(child)] = undefined;
                }
            }
            const count = indexedNode.children.length;
            indexedNode.children = indexedNode.children.filter(n => n !== undefined);
            if (indexedNode.children.length !== count) {
                // console.log('Removed elements:', count - node.children.length);
            }
        }
    }

    extendTileset(tileset: $3dTilesTileset, nodeId: number, baseURL: string) {
        const tile = this.index[nodeId];
        this._recurse(tileset.root, baseURL, tile);
        tile.children = [tileset.root as Tileset];
        tile.isTileset = true;
    }
}

export default $3dTilesIndex;
