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
    type Camera,
} from 'three';
import Entity3D from './Entity3D';
import PointsMaterial, { MODE, type Mode } from '../renderer/PointsMaterial';
import type RequestQueue from '../core/RequestQueue';
import { DefaultQueue } from '../core/RequestQueue';
import type PotreeSource from '../sources/PotreeSource';
import OperationCounter from '../core/OperationCounter';
import PotreeBinParser from '../parser/PotreeBinParser';
import PotreeCinParser from '../parser/PotreeCinParser';
import Fetcher from '../utils/Fetcher';
import Extent from '../core/geographic/Extent';
import PointCloud from '../core/PointCloud';
import type { ObjectToUpdate } from '../core/MainLoop';
import type Context from '../core/Context';
import type Pickable from '../core/picking/Pickable';
import type PickOptions from '../core/picking/PickOptions';
import pickPointsAt, { type PointsPickResult, preparePointGeometryForPicking } from '../core/picking/PickPointsAt';

// Draw a cube with lines (12 lines).
function cube(size: Vector3) {
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

export interface PotreeBoundingBox {
    lx: number,
    ly: number,
    lz: number,
    ux: number,
    uy: number,
    uz: number,
}

export interface PotreeMetadata {
    version: string,
    octreeDir?: string,
    boundingBox?: PotreeBoundingBox,
    tightBoundingBox?: PotreeBoundingBox,
    pointAttributes?: any,
    spacing?: number,
    scale?: number,
    hierarchyStepSize?: number,
}

class BoxHelper extends LineSegments<BufferGeometry, LineBasicMaterial> {
    removeMe?: boolean;

    constructor(size: Vector3, material: LineBasicMaterial) {
        super(cube(size), material);
        this.computeLineDistances();

        this.frustumCulled = false;
        this.material.linewidth = 2;
    }
}

class PotreeTilePointCloud extends PointCloud {
    boxHelper?: BoxHelper;
    tightbbox?: Box3;
}

export interface OctreeItem {
    baseurl: string,
    name: string,
    childrenBitField?: number,
    numPoints?: number,
    children?: OctreeItem[],
    bbox: Box3,
    // eslint-disable-next-line no-use-before-define
    layer?: PotreePointCloud,
    parent?: OctreeItem,
    findChildrenByName?: (node: OctreeItem, name: string) => OctreeItem;
    obj?: PotreeTilePointCloud;
    tightbbox?: Box3;
    visible?: boolean;
    notVisibleSince?: number;
    sse?: number;
    promise?: Promise<void>;
}

const tmp = {
    v: new Vector3(),
};

function markForDeletion(elt: OctreeItem) {
    if (elt.obj) {
        elt.obj.material.visible = false;
        // @ts-ignore
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

function findChildrenByName(node: OctreeItem, name: string): OctreeItem {
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

// Create an A(xis)A(ligned)B(ounding)B(ox) for the child `childIndex` of one aabb.
// (PotreeConverter protocol builds implicit octree hierarchy by applying the same
// subdivision algo recursively)
function createChildAABB(aabb: Box3, childIndex: number) {
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

// eslint-disable-next-line no-use-before-define
type OnPointsCreatedCallback = (entity: PotreePointCloud, pnts: PointCloud) => void;

/**
 * A [Potree](https://github.com/potree/potree) point cloud.
 *
 */
class PotreePointCloud extends Entity3D implements Pickable<PointsPickResult> {
    readonly isPotreePointCloud = true;
    source: PotreeSource;
    queue: RequestQueue;
    private _opCounter: OperationCounter;
    group: Group;
    bboxes: Group;
    octreeDepthLimit: number;
    pointBudget: number;
    pointSize: number;
    sseThreshold: number;
    material: PointsMaterial;
    mode: Mode;
    onPointsCreated: OnPointsCreatedCallback | null;
    isFromPotreeConverter?: boolean;
    metadata?: PotreeMetadata;
    table?: string;
    parse?: (data: ArrayBuffer, pointAttributes: object) => Promise<BufferGeometry>;
    extension?: 'cin' | 'bin';
    supportsProgressiveDisplay?: boolean;
    root?: OctreeItem;
    extent?: Extent;
    displayedCount?: number;

    private _imageSize: Vector2;
    get imageSize(): Vector2 {
        return this._imageSize;
    }

    /**
     * Creates an instance of PotreePointCloud.
     *
     * @param id The unique identifier of this entity.
     * @param source The data source.
     * @example
     * const source = new PotreeSource('http://example.com', 'cloud.js');
     * const cloud = new PotreePointCloud('myCloud', source);
     */
    constructor(id: string, source: PotreeSource) {
        super(id, new Group());
        this.source = source;
        /**
         * Read-only flag to check if a given object is of type PotreePointCloud.
         *
         * @type {boolean}
         */
        this.type = 'PotreePointCloud';

        this.queue = DefaultQueue;
        this._opCounter = new OperationCounter();

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
        this.material = this.material ?? new PointsMaterial();
        this.material.defines = this.material.defines || {};
        this.mode = MODE.COLOR;

        /**
         * Optional hook called when a new point tile is loaded.
         * The parameter is a {@link module:Core/Points~Points Points} object.
         *
         * @type {Function}
         * @example
         * const cloud = new PotreePointCloud('myCloud', source);
         * cloud.onPointsCreated = function(pnts) {
         *  // Do something with the points.
         * }
         */
        this.onPointsCreated = null;
    }

    // eslint-disable-next-line class-methods-use-this
    getObjectToUpdateForAttachedLayers(meta: any): ObjectToUpdate | null {
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
            // @ts-ignore - I have no idea how that could work
            for (const entry of this.metadata) {
                if (entry.table === this.table) {
                    break;
                }
                idx++;
            }
            // @ts-ignore - I have no idea how that could work
            const entityBbox = this.metadata[idx].bbox;
            bbox = new Box3(
                new Vector3(entityBbox.xmin, entityBbox.ymin, entityBbox.zmin),
                new Vector3(entityBbox.xmax, entityBbox.ymax, entityBbox.zmax),
            );
        }
        return bbox;
    }

    parseMetadata(metadata: PotreeMetadata) {
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

    async parseOctree(hierarchyStepSize: number, root: OctreeItem) {
        const blob = await Fetcher.arrayBuffer(`${root.baseurl}/r${root.name}.hrc`, this.source.networkOptions);
        const dataView = new DataView(blob);
        const stack: OctreeItem[] = [];
        let offset = 0;

        root.childrenBitField = dataView.getUint8(0);
        offset += 1;
        root.numPoints = dataView.getUint32(1, true);
        offset += 4;
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

                    let url_1 = root.baseurl;
                    if ((childname.length % hierarchyStepSize) === 0) {
                        const myname = childname.substr(root.name.length);
                        url_1 = `${root.baseurl}/${myname}`;
                    }
                    const item: OctreeItem = {
                        numPoints: n,
                        childrenBitField: c,
                        children: [],
                        name: childname,
                        baseurl: url_1,
                        bbox: bounds,
                        layer: this,
                        parent: snode,
                    };
                    snode.children.push(item);
                    stack.push(item);
                }
            }
        }
        return root;
    }

    async preprocess() {
        const source = this.source;
        this._imageSize = new Vector2(128, 128);
        const metadata = await Fetcher.json(`${source.url}/${source.filename}`, source.networkOptions) as PotreeMetadata;
        this.parseMetadata(metadata);
        const bbox = this.computeBbox();
        const root = await this.parseOctree(
            this.metadata.hierarchyStepSize,
            {
                baseurl: `${source.url}/${this.metadata.octreeDir}/r`,
                name: '',
                bbox,
            },
        );
        this.root = root;
        root.findChildrenByName = findChildrenByName.bind(root, root);
        this.extent = Extent.fromBox3(this._instance.referenceCrs, root.bbox);
    }

    pick(coordinates: Vector2, options?: PickOptions): PointsPickResult[] {
        return pickPointsAt(this._instance, coordinates, this, options);
    }

    updateMinMaxDistance(context: Context, bbox: Box3) {
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

    preUpdate(context: Context, changeSources: Set<unknown>): OctreeItem[] {
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
            this.material.needsUpdate = (currentTransparent !== this.material.transparent);
            this.material.size = this.pointSize;
        }

        // lookup lowest common ancestor of changeSources
        let commonAncestorName: string;
        for (const source of changeSources.values()) {
            if ((source as Camera).isCamera || source === this) {
                // if the change is caused by a camera move, no need to bother
                // to find common ancestor: we need to update the whole tree:
                // some invisible tiles may now be visible
                return [this.root];
            }
            if ((source as OctreeItem).obj === undefined) {
                continue;
            }

            const octreeItem = source as OctreeItem;
            const obj = octreeItem.obj;

            // filter sources that belong to our entity
            if (obj.isPoints && obj.layer === this) {
                const name = octreeItem.name;
                if (!commonAncestorName) {
                    commonAncestorName = name;
                } else {
                    const nameLength = Math.min(name.length, commonAncestorName.length);
                    let i;
                    for (i = 0; i < nameLength; i++) {
                        if (name[i] !== commonAncestorName[i]) {
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

    computeScreenSpaceError(context: Context, elt: OctreeItem, distance: number) {
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

    initBoundingBox(elt: OctreeItem) {
        const size = elt.tightbbox.getSize(tmp.v);
        const lineMaterial = elt.childrenBitField
            ? new LineDashedMaterial({ color: 0, dashSize: 0.25, gapSize: 0.25 })
            : new LineBasicMaterial({ color: 0 });
        elt.obj.boxHelper = new BoxHelper(size, lineMaterial);
        elt.obj.boxHelper.position.copy(elt.tightbbox.min);
        elt.obj.boxHelper.position.add(size.multiplyScalar(0.5));
        elt.obj.boxHelper.updateMatrixWorld(true);
        elt.obj.boxHelper.matrixAutoUpdate = false;
        elt.obj.boxHelper.layers.mask = this.bboxes.layers.mask;
        this.bboxes.add(elt.obj.boxHelper);
        elt.obj.boxHelper.updateMatrixWorld();
    }

    update(context: Context, elt: OctreeItem) {
        if (this.octreeDepthLimit >= 0 && this.octreeDepthLimit < elt.name.length) {
            markForDeletion(elt);
            return null;
        }

        // pick the best bounding box
        const bbox = (elt.tightbbox ? elt.tightbbox : elt.bbox);

        if (context.fastUpdateHint && !elt.name.startsWith(context.fastUpdateHint as string)) {
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
                    if (PointsMaterial.isPointsMaterial(elt.obj.material)) {
                        elt.obj.material.update(this.material);
                    } else {
                        elt.obj.material.copy(this.material);
                    }
                    // @ts-ignore
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

                    elt.promise = this.queue.enqueue({
                        id: MathUtils.generateUUID(),
                        priority,
                        shouldExecute: () => elt.visible && this.visible,
                        request: () => this.executeCommand(elt, elt.childrenBitField === 0),
                    }).then((pts: PotreeTilePointCloud) => {
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
                        this._instance.notifyChange(this);
                    }, err => {
                        if (err instanceof Error && err.message === 'aborted') {
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    postUpdate(context: Context, changeSource: Set<unknown>) {
        if (!this.group) {
            return;
        }

        this.displayedCount = 0;
        for (const obj3d of this.group.children) {
            const pts = obj3d as PotreeTilePointCloud;
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
                for (const obj3d of this.group.children) {
                    const pts = obj3d as PotreeTilePointCloud;
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
                for (const obj3d of this.group.children) {
                    const pts = obj3d as PotreeTilePointCloud;
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
            const obj = this.group.children[i] as PotreeTilePointCloud;
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

                // @ts-ignore
                if (__DEBUG__) {
                    if (obj.boxHelper) {
                        obj.boxHelper.removeMe = true;
                        obj.boxHelper.material.dispose();
                        obj.boxHelper.geometry.dispose();
                    }
                }
            }
        }

        // @ts-ignore
        if (__DEBUG__) {
            this.bboxes.children = this.bboxes.children.filter((b: BoxHelper) => !b.removeMe);
        }
    }

    async executeCommand(metadata: OctreeItem, isLeaf: boolean) {
        // Query HRC if we don't have children metadata yet.
        if (metadata.childrenBitField && metadata.children.length === 0) {
            this.parseOctree(this.metadata.hierarchyStepSize, metadata)
                .then(() => this._instance.notifyChange(this, false));
        }

        // `isLeaf` is for lopocs and allows the pointcloud server to consider that the current
        // node is the last one, even if we could subdivide even further.
        // It's necessary because lopocs doens't know about the hierarchy (it generates it on the
        // fly when we request .hrc files)
        const url = `${metadata.baseurl}/r${metadata.name}.${this.extension}?isleaf=${isLeaf ? 1 : 0}`;

        const buffer = await Fetcher.arrayBuffer(url, this.source.networkOptions);
        const geometry = await this.parse(buffer, this.metadata.pointAttributes);
        const points = new PotreeTilePointCloud({
            layer: this,
            geometry,
            material: this.material.clone(),
            textureSize: this.imageSize,
        });
        points.name = `r${metadata.name}.${this.extension}`;
        if (PointsMaterial.isPointsMaterial(points.material)) {
            preparePointGeometryForPicking(points.geometry);
        }
        points.frustumCulled = false;
        points.matrixAutoUpdate = false;
        points.position.copy(metadata.bbox.min);
        points.scale.set(this.metadata.scale, this.metadata.scale, this.metadata.scale);
        points.updateMatrix();
        points.tightbbox = geometry.boundingBox.applyMatrix4(points.matrix);
        points.extent = Extent.fromBox3(this._instance.referenceCrs, metadata.bbox);
        points.userData.metadata = metadata;
        this.onObjectCreated(points);
        return points;
    }
}

export default PotreePointCloud;
