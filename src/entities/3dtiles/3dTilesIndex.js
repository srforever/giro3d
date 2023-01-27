import {
    Box3,
    Matrix4,
    Sphere,
    Vector3,
} from 'three';

const identity = new Matrix4();

class $3dTilesIndex {
    constructor(tileset, baseURL) {
        this._counter = 1;
        this.index = {};
        this._inverseTileTransform = new Matrix4();
        this._recurse(tileset.root, baseURL);
    }

    _recurse(node, baseURL, parent) {
        // compute transform (will become Object3D.matrix when the object is downloaded)
        node.transform = node.transform
            ? (new Matrix4()).fromArray(node.transform) : identity;

        // The only reason to store _worldFromLocalTransform is because of extendTileset where we
        // need the transform chain for one node.
        node._worldFromLocalTransform = node.transform;
        if (parent && parent._worldFromLocalTransform) {
            if (node.transform) {
                node._worldFromLocalTransform = new Matrix4().multiplyMatrices(
                    parent._worldFromLocalTransform, node.transform,
                );
            } else {
                node._worldFromLocalTransform = parent._worldFromLocalTransform;
            }
        }

        // this._inverseTileTransform.copy(node._worldFromLocalTransform).invert();
        // getBox only use this._inverseTileTransform for volume.region so let's not
        // compute the inverse matrix each time
        if (node._worldFromLocalTransform) {
            this._inverseTileTransform.copy(node._worldFromLocalTransform).invert();
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

export default $3dTilesIndex;
