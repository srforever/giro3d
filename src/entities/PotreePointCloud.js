/**
 * @module entities/PotreePointCloud
 */
import {
    Box3,
    Group,
    BufferAttribute,
    BufferGeometry,
    LineBasicMaterial,
    LineDashedMaterial,
    LineSegments,
    MathUtils,
    Vector2,
    Vector3,
} from 'three';
import Entity3D from './Entity3D.js';
import PointsMaterial, { MODE } from '../renderer/PointsMaterial.js';
import CancelledCommandException from '../core/scheduler/CancelledCommandException.js';
import PotreeSource from '../sources/PotreeSource.js';
import OperationCounter from '../core/OperationCounter.js';
import PotreeBinParser from '../parser/PotreeBinParser.js';
import PotreeCinParser from '../parser/PotreeCinParser.js';
import Fetcher from '../utils/Fetcher.js';
import Picking from '../core/Picking.js';
import Extent from '../core/geographic/Extent.js';
import Points from '../core/Points.js';

// Draw a cube with lines (12 lines).
function cube(size) {
    const h = size.clone().multiplyScalar(0.5);
    const vertices = new Float32Array([
        -h.x, -h.y, -h.z,
        -h.x, h.y, -h.z,
        -h.x, h.y, -h.z,
        h.x, h.y, -h.z,
        h.x, h.y, -h.z,
        h.x, -h.y, -h.z,
        h.x, -h.y, -h.z,
        -h.x, -h.y, -h.z,
        -h.x, -h.y, h.z,
        -h.x, h.y, h.z,
        -h.x, h.y, h.z,
        h.x, h.y, h.z,
        h.x, h.y, h.z,
        h.x, -h.y, h.z,
        h.x, -h.y, h.z,
        -h.x, -h.y, h.z,
        -h.x, -h.y, -h.z,
        -h.x, -h.y, h.z,
        -h.x, h.y, -h.z,
        -h.x, h.y, h.z,
        h.x, h.y, -h.z,
        h.x, h.y, h.z,
        h.x, -h.y, -h.z,
        h.x, -h.y, h.z,
    ]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(vertices, 3));
    return geometry;
}

const tmp = {
    v: new Vector3(),
};

function getObjectToUpdateForAttachedLayers(meta) {
    if (!meta.obj) {
        return null;
    }
    const p = meta.parent;
    if (p && p.obj) {
        return {
            element: meta.obj,
            parent: p.obj,
        };
    }
    return {
        element: meta.obj,
    };
}

function markForDeletion(elt) {
    if (elt.obj) {
        elt.obj.material.visible = false;
        if (__DEBUG__) {
            if (elt.obj.boxHelper) {
                elt.obj.boxHelper.material.visible = false;
            }
        }
    }

    if (!elt.notVisibleSince) {
        elt.notVisibleSince = Date.now();
        // Set .sse to an invalid value
        elt.sse = -1;
    }
    for (const child of elt.children) {
        markForDeletion(child);
    }
}

function findChildrenByName(node, name) {
    if (node.name === name) {
        return node;
    }
    const charIndex = node.name.length;
    for (let i = 0; i < node.children.length; i++) {
        if (node.children[i].name[charIndex] === name[charIndex]) {
            return findChildrenByName(node.children[i], name);
        }
    }
    throw new Error(`Cannot find node with name '${name}'`);
}

/**
 * A [Potree](https://github.com/potree/potree) point cloud.
 *
 * @api
 */
class PotreePointCloud extends Entity3D {
    /**
     * Creates an instance of PotreePointCloud.
     *
     * @api
     * @param {string} id The unique identifier of this entity.
     * @param {PotreeSource} source The data source.
     * @example
     * const source = new PotreeSource('http://example.com', 'cloud.js');
     * const cloud = new PotreePointCloud('myCloud', source);
     */
    constructor(id, source) {
        super(id, new Group());
        this.source = source;
        this.type = 'PotreePointCloud';

        this._opCounter = new OperationCounter();

        // override the default method, since updated objects are metadata in this case
        this.getObjectToUpdateForAttachedLayers = getObjectToUpdateForAttachedLayers;

        if (!this.group) {
            this.group = new Group();
            this.group.name = 'root';
            this.object3d.add(this.group);
            this.group.updateMatrixWorld();
        }

        if (!this.bboxes) {
            this.bboxes = new Group();
            this.bboxes.name = 'bboxes';
            this.object3d.add(this.bboxes);
            this.bboxes.updateMatrixWorld();
            this.bboxes.visible = false;
        }

        // default options
        this.octreeDepthLimit = this.octreeDepthLimit || -1;
        this.pointBudget = this.pointBudget || 2000000;
        this.pointSize = !this.pointSize || Number.isNaN(this.pointSize)
            ? 4
            : this.pointSize;
        this.sseThreshold = this.sseThreshold || 2;
        this.material = this.material || {};
        this.material = this.material.isMaterial
            ? this.material
            : new PointsMaterial(this.material);
        this.material.defines = this.material.defines || {};
        this.mode = MODE.COLOR;

        /**
         * Optional hook called when a new point tile is loaded.
         * The parameter is a {@link module:Core/Points~Points Points} object.
         *
         * @api
         * @type {Function}
         * @example
         * const cloud = new PotreePointCloud('myCloud', source);
         * cloud.onPointsCreated = function(pnts) {
         *  // Do something with the points.
         * }
         */
        this.onPointsCreated = null;
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

    computeBbox() {
        let bbox;
        if (this.isFromPotreeConverter) {
            const entityBbox = this.metadata.boundingBox;
            bbox = new Box3(
                new Vector3(entityBbox.lx, entityBbox.ly, entityBbox.lz),
                new Vector3(entityBbox.ux, entityBbox.uy, entityBbox.uz),
            );
        } else {
            // lopocs
            let idx = 0;
            for (const entry of this.metadata) {
                if (entry.table === this.table) {
                    break;
                }
                idx++;
            }
            const entityBbox = this.metadata[idx].bbox;
            bbox = new Box3(
                new Vector3(entityBbox.xmin, entityBbox.ymin, entityBbox.zmin),
                new Vector3(entityBbox.xmax, entityBbox.ymax, entityBbox.zmax),
            );
        }
        return bbox;
    }

    parseMetadata(metadata) {
        this.metadata = metadata;

        let customBinFormat = true;

        // Lopocs pointcloud server can expose the same file structure as PotreeConverter output.
        // The only difference is the metadata root file (cloud.js vs infos/sources), and we can
        // check for the existence of a `scale` field.
        // (if `scale` is defined => we're fetching files from PotreeConverter)
        if (this.metadata.scale !== undefined) {
            this.isFromPotreeConverter = true;
            // PotreeConverter format
            customBinFormat = this.metadata.pointAttributes === 'CIN';
            // do we have normal information
            const normal = Array.isArray(this.metadata.pointAttributes)
                && this.metadata.pointAttributes.find(elem => elem.startsWith('NORMAL'));
            if (normal) {
                this.material.defines[normal] = 1;
            }
        } else {
            // Lopocs
            this.metadata.scale = 1;
            this.metadata.octreeDir = `giro3d/${this.table}.points`;
            this.metadata.hierarchyStepSize = 1000000; // ignore this with lopocs
            customBinFormat = true;
        }

        this.parse = customBinFormat ? PotreeCinParser.parse : PotreeBinParser.parse;
        this.extension = customBinFormat ? 'cin' : 'bin';
        this.supportsProgressiveDisplay = customBinFormat;
    }

    preprocess() {
        const source = this.source;
        this.imageSize = new Vector2(128, 128);
        return Fetcher.json(`${source.url}/${source.filename}`, source.networkOptions)
            .then(metadata => {
                this.parseMetadata(metadata);
                const bbox = this.computeBbox();
                return parseOctree(
                    this,
                    this.metadata.hierarchyStepSize,
                    { baseurl: `${source.url}/${this.metadata.octreeDir}/r`, name: '', bbox },
                );
            })
            .then(root => {
                this.root = root;
                root.findChildrenByName = findChildrenByName.bind(root, root);
                this.extent = Extent.fromBox3(this._instance.referenceCrs, root.bbox);

                return this;
            });
    }

    pickObjectsAt(coordinates, options, target) {
        return Picking.pickPointsAt(this._instance, coordinates, this, options, target);
    }

    updateMinMaxDistance(context, bbox) {
        const distance = context.distance.plane
            .distanceToPoint(bbox.getCenter(tmp.v));
        const radius = bbox.getSize(tmp.v).length() * 0.5;
        this._distance.min = Math.min(this._distance.min, distance - radius);
        this._distance.max = Math.max(this._distance.max, distance + radius);
        return distance;
    }

    getBoundingBox() {
        if (this.root && this.root.bbox) {
            return this.root.bbox;
        }

        return null;
    }

    preUpdate(context, changeSources) {
        // Bail-out if not ready
        if (!this.root) {
            return [];
        }

        // See https://cesiumjs.org/hosted-apps/massiveworlds/downloads/Ring/WorldScaleTerrainRendering.pptx
        // slide 17
        context.camera.preSSE = context.camera.height
                    / (2 * Math.tan(MathUtils.degToRad(context.camera.camera3D.fov) * 0.5));

        if (this.material) {
            this.material.visible = this.visible;
            this.material.opacity = this.opacity;
            const currentTransparent = this.material.transparent;
            this.material.transparent = this.opacity < 1;
            this.material.needsUpdate |= (currentTransparent !== this.material.transparent);
            this.material.size = this.pointSize;
        }

        // lookup lowest common ancestor of changeSources
        let commonAncestorName;
        for (const source of changeSources.values()) {
            if (source.isCamera || source === this) {
                // if the change is caused by a camera move, no need to bother
                // to find common ancestor: we need to update the whole tree:
                // some invisible tiles may now be visible
                return [this.root];
            }
            if (source.obj === undefined) {
                continue;
            }
            // filter sources that belong to our entity
            if (source.obj.isPoints && source.obj.layer === this) {
                if (!commonAncestorName) {
                    commonAncestorName = source.name;
                } else {
                    const nameLength = Math.min(source.name.length, commonAncestorName.length);
                    let i;
                    for (i = 0; i < nameLength; i++) {
                        if (source.name[i] !== commonAncestorName[i]) {
                            break;
                        }
                    }
                    commonAncestorName = commonAncestorName.substr(0, i);
                    if (commonAncestorName.length === 0) {
                        break;
                    }
                }
            }
        }
        if (commonAncestorName) {
            context.fastUpdateHint = commonAncestorName;
        }

        // Start updating from hierarchy root
        return [this.root];
    }

    computeScreenSpaceError(context, elt, distance) {
        if (distance <= 0) {
            return Infinity;
        }
        const pointSpacing = this.metadata.spacing / (2 ** elt.name.length);
        // Estimate the onscreen distance between 2 points
        const onScreenSpacing = (context.camera.preSSE * pointSpacing) / distance;
        // [  P1  ]--------------[   P2   ]
        //     <--------------------->      = pointsSpacing (in world coordinates)
        //                                  ~ onScreenSpacing (in pixels)
        // <------>                         = layer.pointSize (in pixels)
        // we are interested in the radius of the points, not their total size.
        const pointRadius = this.pointSize / 2;
        return Math.max(0.0, onScreenSpacing - pointRadius);
    }

    initBoundingBox(elt) {
        const size = elt.tightbbox.getSize(tmp.v);
        const lineMaterial = elt.childrenBitField
            ? new LineDashedMaterial({ color: 0, dashSize: 0.25, gapSize: 0.25 })
            : new LineBasicMaterial({ color: 0 });
        elt.obj.boxHelper = new LineSegments(cube(size), lineMaterial);
        elt.obj.boxHelper.computeLineDistances();

        elt.obj.boxHelper.frustumCulled = false;
        elt.obj.boxHelper.position.copy(elt.tightbbox.min);
        elt.obj.boxHelper.position.add(size.multiplyScalar(0.5));
        elt.obj.boxHelper.updateMatrixWorld(true);
        elt.obj.boxHelper.autoUpdateMatrix = false;
        elt.obj.boxHelper.material.linewidth = 2;
        elt.obj.boxHelper.layers.mask = this.bboxes.layers.mask;
        this.bboxes.add(elt.obj.boxHelper);
        elt.obj.boxHelper.updateMatrixWorld();
    }

    update(context, elt) {
        if (this.octreeDepthLimit >= 0 && this.octreeDepthLimit < elt.name.length) {
            markForDeletion(elt);
            return null;
        }

        // pick the best bounding box
        const bbox = (elt.tightbbox ? elt.tightbbox : elt.bbox);

        if (context.fastUpdateHint && !elt.name.startsWith(context.fastUpdateHint)) {
            if (!elt.visible) {
                return null;
            }
            this.updateMinMaxDistance(context, bbox);
        } else {
            elt.visible = context.camera.isBox3Visible(bbox, this.object3d.matrixWorld);

            if (!elt.visible) {
                markForDeletion(elt);
                return null;
            }

            const distance = this.updateMinMaxDistance(context, bbox);
            elt.notVisibleSince = undefined;

            // only load geometry if this elements has points
            if (elt.numPoints > 0) {
                if (elt.obj) {
                    if (elt.obj.material.update) {
                        elt.obj.material.update(this.material);
                    } else {
                        elt.obj.material.copy(this.material);
                    }
                    if (__DEBUG__) {
                        if (this.bboxes.visible) {
                            if (!elt.obj.boxHelper) {
                                this.initBoundingBox(elt);
                            }
                            elt.obj.boxHelper.visible = true;
                            elt.obj.boxHelper.material.color.r = 1 - elt.sse;
                            elt.obj.boxHelper.material.color.g = elt.sse;
                        }
                    }
                } else if (!elt.promise) {
                    // Increase priority of nearest node
                    const priority = this.computeScreenSpaceError(context, elt, distance)
                            / Math.max(0.001, distance);

                    this._opCounter.increment();

                    elt.promise = context.scheduler.execute({
                        layer: this,
                        fn: () => this.executeCommand(elt, elt.childrenBitField === 0),
                        requester: elt,
                        instance: context.instance,
                        priority,
                        redraw: true,
                        earlyDropFunction: () => !elt.visible || !this.visible,
                    }).then(pts => {
                        if (this.onPointsCreated) {
                            this.onPointsCreated(this, pts);
                        }

                        elt.obj = pts;
                        // store tightbbox to avoid ping-pong
                        // (bbox = larger => visible, tight => invisible)
                        elt.tightbbox = pts.tightbbox;

                        // make sure to add it here, otherwise it might never
                        // be added nor cleaned
                        this.group.add(elt.obj);
                        elt.obj.updateMatrixWorld(true);
                        elt.promise = null;
                    }, err => {
                        if (err instanceof CancelledCommandException) {
                            elt.promise = null;
                        }
                    }).finally(() => this._opCounter.decrement());
                }
            }

            if (elt.children && elt.children.length) {
                elt.sse = this.computeScreenSpaceError(context, elt, distance)
                        / this.sseThreshold;
            }
        }

        if (elt.children && elt.children.length) {
            if (elt.sse >= 1) {
                return elt.children;
            }
            for (const child of elt.children) {
                markForDeletion(child);
            }
        }
        return null;
    }

    get loading() {
        return this._opCounter.loading || this._attachedLayers.some(l => l.loading);
    }

    get progress() {
        let sum = this._opCounter.progress;
        sum = this._attachedLayers.reduce((accum, current) => accum + current.progress, sum);
        return sum / (this._attachedLayers.length + 1);
    }

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    postUpdate(context, changeSource) {
        if (!this.group) {
            return;
        }

        this.displayedCount = 0;
        for (const pts of this.group.children) {
            if (pts.material.visible) {
                const { count } = pts.geometry.attributes.position;
                pts.geometry.setDrawRange(0, count);
                this.displayedCount += count;
            }
        }

        if (this.displayedCount > this.pointBudget) {
            // 2 different point count limit implementation, depending on the pointcloud source
            if (this.supportsProgressiveDisplay) {
                // In this format, points are evenly distributed within a node,
                // so we can draw a percentage of each node and still get a correct
                // representation
                const reduction = this.pointBudget / this.displayedCount;
                for (const pts of this.group.children) {
                    if (pts.material.visible) {
                        const count = Math.floor(pts.geometry.drawRange.count * reduction);
                        if (count > 0) {
                            pts.geometry.setDrawRange(0, count);
                        } else {
                            pts.material.visible = false;
                        }
                    }
                }
                this.displayedCount *= reduction;
            } else {
                // This format doesn't require points to be evenly distributed, so
                // we're going to sort the nodes by "importance" (= on screen size)
                // and display only the first N nodes
                this.group.children
                    .sort((p1, p2) => p2.userData.metadata.sse - p1.userData.metadata.sse);

                let limitHit = false;
                this.displayedCount = 0;
                for (const pts of this.group.children) {
                    const { count } = pts.geometry.attributes.position;
                    if (limitHit || (this.displayedCount + count) > this.pointBudget) {
                        pts.material.visible = false;
                        limitHit = true;
                    } else {
                        this.displayedCount += count;
                    }
                }
            }
        }

        const now = Date.now();
        for (let i = this.group.children.length - 1; i >= 0; i--) {
            const obj = this.group.children[i];
            if (!obj.userData || !obj.userData.metadata) {
                continue;
            }
            const notVisibleSince = obj.userData.metadata.notVisibleSince;
            if (!obj.material.visible && (now - notVisibleSince) > 10000) {
                // remove from group
                this.group.children.splice(i, 1);

                obj.material.dispose();
                obj.geometry.dispose();
                obj.material = null;
                obj.geometry = null;
                obj.userData.metadata.obj = null;

                if (__DEBUG__) {
                    if (obj.boxHelper) {
                        obj.boxHelper.removeMe = true;
                        obj.boxHelper.material.dispose();
                        obj.boxHelper.geometry.dispose();
                    }
                }
            }
        }

        if (__DEBUG__) {
            this.bboxes.children = this.bboxes.children.filter(b => !b.removeMe);
        }
    }

    executeCommand(metadata, isLeaf) {
        // Query HRC if we don't have children metadata yet.
        if (metadata.childrenBitField && metadata.children.length === 0) {
            parseOctree(this, this.metadata.hierarchyStepSize, metadata)
                .then(() => this._instance.notifyChange(this, false));
        }

        // `isLeaf` is for lopocs and allows the pointcloud server to consider that the current
        // node is the last one, even if we could subdivide even further.
        // It's necessary because lopocs doens't know about the hierarchy (it generates it on the
        // fly when we request .hrc files)
        const url = `${metadata.baseurl}/r${metadata.name}.${this.extension}?isleaf=${isLeaf ? 1 : 0}`;

        return Fetcher.arrayBuffer(url, this.source.networkOptions)
            .then(buffer => this.parse(buffer, this.metadata.pointAttributes)).then(geometry => {
                const points = new Points({
                    layer: this,
                    geometry,
                    material: this.material.clone(),
                    textureSize: this.imageSize,
                });
                points.name = `r${metadata.name}.${this.extension}`;
                if (points.material.enablePicking) {
                    Picking.preparePointGeometryForPicking(points.geometry);
                }
                points.frustumCulled = false;
                points.matrixAutoUpdate = false;
                points.position.copy(metadata.bbox.min);
                points.scale.set(this.metadata.scale, this.metadata.scale, this.metadata.scale);
                points.updateMatrix();
                points.tightbbox = geometry.boundingBox.applyMatrix4(points.matrix);
                points.layer = this;
                points.extent = Extent.fromBox3(this._instance.referenceCrs, metadata.bbox);
                points.userData.metadata = metadata;
                return points;
            })
            .catch(e => {
                console.error(e);
            });
    }
}

// Create an A(xis)A(ligned)B(ounding)B(ox) for the child `childIndex` of one aabb.
// (PotreeConverter protocol builds implicit octree hierarchy by applying the same
// subdivision algo recursively)
function createChildAABB(aabb, childIndex) {
    // Code taken from potree
    let { min } = aabb;
    let { max } = aabb;
    const dHalfLength = new Vector3().copy(max).sub(min).multiplyScalar(0.5);
    const xHalfLength = new Vector3(dHalfLength.x, 0, 0);
    const yHalfLength = new Vector3(0, dHalfLength.y, 0);
    const zHalfLength = new Vector3(0, 0, dHalfLength.z);

    const cmin = min;
    const cmax = new Vector3().add(min).add(dHalfLength);

    if (childIndex === 1) {
        min = new Vector3().copy(cmin).add(zHalfLength);
        max = new Vector3().copy(cmax).add(zHalfLength);
    } else if (childIndex === 3) {
        min = new Vector3().copy(cmin).add(zHalfLength).add(yHalfLength);
        max = new Vector3().copy(cmax).add(zHalfLength).add(yHalfLength);
    } else if (childIndex === 0) {
        min = cmin;
        max = cmax;
    } else if (childIndex === 2) {
        min = new Vector3().copy(cmin).add(yHalfLength);
        max = new Vector3().copy(cmax).add(yHalfLength);
    } else if (childIndex === 5) {
        min = new Vector3().copy(cmin).add(zHalfLength).add(xHalfLength);
        max = new Vector3().copy(cmax).add(zHalfLength).add(xHalfLength);
    } else if (childIndex === 7) {
        min = new Vector3().copy(cmin).add(dHalfLength);
        max = new Vector3().copy(cmax).add(dHalfLength);
    } else if (childIndex === 4) {
        min = new Vector3().copy(cmin).add(xHalfLength);
        max = new Vector3().copy(cmax).add(xHalfLength);
    } else if (childIndex === 6) {
        min = new Vector3().copy(cmin).add(xHalfLength).add(yHalfLength);
        max = new Vector3().copy(cmax).add(xHalfLength).add(yHalfLength);
    }

    return new Box3(min, max);
}

function parseOctree(entity, hierarchyStepSize, root) {
    return Fetcher.arrayBuffer(`${root.baseurl}/r${root.name}.hrc`, entity.networkOptions).then(blob => {
        const dataView = new DataView(blob);

        const stack = [];

        let offset = 0;

        root.childrenBitField = dataView.getUint8(0); offset += 1;
        root.numPoints = dataView.getUint32(1, true); offset += 4;
        root.children = [];

        stack.push(root);

        while (stack.length && offset < blob.byteLength) {
            const snode = stack.shift();
            // look up 8 children
            for (let i = 0; i < 8; i++) {
                // does snode have a #i child ?
                if (snode.childrenBitField & (1 << i) && (offset + 5) <= blob.byteLength) {
                    const c = dataView.getUint8(offset); offset += 1;
                    let n = dataView.getUint32(offset, true); offset += 4;
                    if (n === 0) {
                        n = root.numPoints;
                    }
                    const childname = snode.name + i;
                    const bounds = createChildAABB(snode.bbox, i);

                    let url = root.baseurl;
                    if ((childname.length % hierarchyStepSize) === 0) {
                        const myname = childname.substr(root.name.length);
                        url = `${root.baseurl}/${myname}`;
                    }
                    const item = {
                        numPoints: n,
                        childrenBitField: c,
                        children: [],
                        name: childname,
                        baseurl: url,
                        bbox: bounds,
                        layer: entity,
                        parent: snode,
                    };
                    snode.children.push(item);
                    stack.push(item);
                }
            }
        }

        return root;
    });
}

export default PotreePointCloud;
