import type {
    Line, Material, Mesh, Object3D, Points, Plane,
} from 'three';
import {
    Box3, Group, Vector3,
} from 'three';
import type VectorSource from 'ol/source/Vector';
import type Feature from 'ol/Feature';
import type { Geometry, GeometryCollection, SimpleGeometry } from 'ol/geom';

import type Context from '../core/Context';
import type Extent from '../core/geographic/Extent';
import ScreenSpaceError from '../core/ScreenSpaceError';
import LayerUpdateState from '../core/layer/LayerUpdateState.js';
import Entity3D from './Entity3D';
import OperationCounter from '../core/OperationCounter';
import { DefaultQueue } from '../core/RequestQueue';
import OlFeature2Mesh from '../utils/OlFeature2Mesh';
import {
    type FeatureStyle,
    type FeatureStyleCallback,
    type FeatureElevationCallback,
    type FeatureExtrusionOffsetCallback,
} from '../core/FeatureTypes';
import OLUtils from '../utils/OpenLayersUtils';

const vector = new Vector3();

function setNodeContentVisible(node: Group, visible: boolean) {
    for (const child of node.children) {
        // hide the content of the tile without hiding potential children tile's content
        if (!child.userData.isTile) {
            child.visible = visible;
        }
    }
}

function selectBestSubdivisions(extent: Extent) {
    const dims = extent.dimensions();
    const ratio = dims.x / dims.y;
    let x = 1;
    let y = 1;
    if (ratio > 1) {
        // Our extent is an horizontal rectangle
        x = Math.round(ratio);
    } else if (ratio < 1) {
        // Our extent is an vertical rectangle
        y = Math.round(1 / ratio);
    }

    return { x, y };
}

// knowledge we bring: the only subclasses of Geometry are SimpleGeometry and GeometryCollection
// beware, GeometryCollection can contain other GeometryCollection :-)
function getFirstSimpleGeom(geom: Geometry): SimpleGeometry {
    if ('getGeometries' in geom) {
        const gs = (geom as GeometryCollection).getGeometries();
        if (gs.length === 0) {
            return null;
        }
        return getFirstSimpleGeom(gs[0]);
    }
    return geom as SimpleGeometry;
}

/**
 * This function will be called just after the mesh is created, before it is added to the scene. It
 * gives an opportunity to modify the resulting mesh as needed by the application.
 */
export type OnMeshCreatedCallback = (mesh: Mesh) => void;

/**
 * Callback called when a tile is created, with the tile object.
 */
export type OnTileCreatedCallback = (tile: Group) => void;

/**
 * A FeatureCollection is an {@link entities.Entity} that manages 2.5D features
 * as 3D meshes in giro3D scene.
 *
 * In this context, 2.5D means that there is only one Z per x,y coordinates in the source data. So
 * this deals with lines, polyline, (multi)polygons and points.
 *
 * This entity will represent them as 3D object as-is, but an elevation can be set (see
 * `options.elevation` in the constructor), if not already in the source coordinates.
 *
 * At the moment, this entity accepts every openlayers source that returns features.
 *
 * NOTE: if your source doesn't have a notion of level of detail, like a WFS server, you must choose
 * one level where data will be downloaded. The level giving the best user experience depends on the
 * data source. You must configure both `minLevel` and `maxLevel` to this level.
 *
 *
 * Examples:
 *
 * ```js
 * import VectorSource from 'ol/source/Vector.js';
 * import FeatureCollection from '@giro3d/giro3d/entities/FeatureCollection';
 *
 * const vectorSource = new VectorSource({
 *  // ...
 * });
 * const featureCollection = new FeatureCollection('features', {
 *  source: vectorSource
 *  minLevel: 10,
 *  maxLevel: 10,
 *  elevation: (feature) => feat.getProperties().elevation,
 * });
 *
 * instance.add(featureCollection);
 *
 * ```
 *
 * Related examples:
 *
 * - [WFS as 3D meshes](/examples/wfs_mesh.html)
 * - [IGN data](/examples/ign_data.html)
 *
 */
class FeatureCollection extends Entity3D {
    readonly extent: Extent;
    private subdivisions: { x: number; y: number };
    private source: VectorSource;
    private _opCounter: OperationCounter;
    private _tileIdSet: Set<string | number>;

    public readonly isFeatureCollection = true;
    public readonly level0Nodes: Group[];

    public minLevel: number = 0;
    public maxLevel: number = 0;
    public onTileCreated: OnTileCreatedCallback;
    public onMeshCreated: OnMeshCreatedCallback;
    public sseScale: number = 1;
    public style: FeatureStyle | FeatureStyleCallback;
    public material: Material;
    public extrusionOffset: FeatureExtrusionOffsetCallback | number | Array<number>;
    public elevation: FeatureElevationCallback | number | Array<number>;
    public dataProjection: string;

    /**
     *
     * Construct a `FeatureCollection`.
     *
     * @param id The unique identifier of this FeatureCollection
     * @param [options={}] Constructor options.
     * @param options.source The [ol.VectorSource](https://openlayers.org/en/latest/apidoc/module-ol_source_Vector-VectorSource.html) providing features to this
     * entity
     * @param options.dataProjection The EPSG code for the projections of the features. If null or
     * empty, no reprojection will be done. If a valid epsg code is given and if different from
     * instance.referenceCrs, each feature will be reprojected before mesh conversion occurs. Please
     * note that reprojection can be somewhat heavy on cpu ressources.
     * @param options.extent The geographic extent of the map, mandatory.
     * @param [options.object3d=new THREE.Group()] The optional 3d object to
     * use as the root
     * @param [options.minLevel=0] The min subdivision level to start processing features.
     * Useful for WFS or other untiled servers, to avoid to download the entire dataset when the
     * whole extent is visible.
     * @param [options.maxLevel=Infinity] The max level to subdivide the extent and
     * process features.
     * @param [options.onMeshCreated] called when a mesh is created (just
     * after conversion of the source data)
     * @param [options.material] the
     * [THREE.Material](https://threejs.org/docs/#api/en/materials/Material) to use for meshes
     * @param [options.elevation] Set the elevation of the
     * features received from the source. It can be a constant for every feature, or a callback. The
     * callback version is particularly useful to derive the elevation from the properties of the
     * feature.
     * @param [options.style] an object or a callback
     * returning such object to style the individual feature. If an object is returned, the
     * informations it contains will be used to style every feature the same way. If a callback is
     * provided, it
     * will be called with the feature. This allows to individually style each feature.
     * @param options.extrusionOffset if set, this will cause 2D features to be extruded of the
     * corresponding amount. If a single value is given, it will be used for all the vertices of all
     * the features. if an array is given, each extruded vertex will use the corresponding value. If
     * a callback is given, it allows to extrude each feature individually.
     * @param options.onTileCreated callback called just after the subdivision, with the THREE.Group
     * representing a tile
     */
    constructor(
        id: string,
        options: {
            source: VectorSource;
            dataProjection?: string;
            extent: Extent;
            object3d?: Object3D;
            minLevel?: number;
            maxLevel?: number;
            elevation?: number | number[] | FeatureElevationCallback;
            extrusionOffset?: number | number[] | FeatureExtrusionOffsetCallback;
            style?: FeatureStyle | FeatureStyleCallback;
            material?: Material;
            onMeshCreated?: OnMeshCreatedCallback;
            onTileCreated?: OnTileCreatedCallback;
        },
    ) {
        super(id, options.object3d || new Group());

        if (!options.extent) {
            throw new Error(
                `Error while initializing FeatureCollection with id "${id}": missing options.extent`,
            );
        }
        if (!options.extent.isValid()) {
            throw new Error(
                'Invalid extent: minX must be less than maxX and minY must be less than maxY.',
            );
        }
        if (!options.source) {
            throw new Error('options.source is mandatory.');
        }
        this.dataProjection = options.dataProjection;
        this.extent = options.extent;
        this.subdivisions = selectBestSubdivisions(this.extent);

        this.maxLevel = options.maxLevel ?? Infinity;
        this.minLevel = options.minLevel ?? 0;

        this.extrusionOffset = options.extrusionOffset;
        this.elevation = options.elevation;
        this.style = options.style;
        this.material = options.material;

        this.sseScale = 1;

        /**
         * Read-only flag to check if a given object is of type FeatureCollection.
         *
         * @type {boolean}
         * @api
         */
        this.isFeatureCollection = true;
        this.type = 'FeatureCollection';
        this.visible = true;

        this.onTileCreated = options.onTileCreated || (() => {});
        this.onMeshCreated = options.onMeshCreated || (() => {});
        this.level0Nodes = [];

        this.source = options.source;

        this._opCounter = new OperationCounter();

        // some protocol like WFS have no real tiling system, so we need to make sure we don't get
        // duplicated elements
        this._tileIdSet = new Set();
    }

    preprocess() {
        // If the map is not square, we want to have more than a single
        // root tile to avoid elongated tiles that hurt visual quality and SSE computation.
        const rootExtents = this.extent.split(this.subdivisions.x, this.subdivisions.y);

        let i = 0;
        for (const root of rootExtents) {
            if (this.subdivisions.x > this.subdivisions.y) {
                this.level0Nodes.push(this.buildNewTile(root, 0, i, 0));
            } else if (this.subdivisions.y > this.subdivisions.x) {
                this.level0Nodes.push(this.buildNewTile(root, 0, 0, i));
            } else {
                this.level0Nodes.push(this.buildNewTile(root, 0, 0, 0));
            }
            i++;
        }
        for (const level0 of this.level0Nodes) {
            this.object3d.add(level0);
            level0.updateMatrixWorld();
        }

        return Promise.resolve();
    }

    /**
     * Gets whether this entity is currently loading data.
     *
     * @api
     * @type {boolean}
     */
    get loading() {
        return this._opCounter.loading;
    }

    /**
     * Gets the progress value of the data loading.
     *
     * @api
     * @type {number}
     */
    get progress() {
        return this._opCounter.progress;
    }

    private buildNewTile(extent: Extent, z: number, x = 0, y = 0) {
        // create a simple square shape. We duplicate the top left and bottom right
        // vertices because each vertex needs to appear once per triangle.
        extent = extent.as(this._instance.referenceCrs);
        const tile = new Group();
        const data = tile.userData;
        data.isTile = true;
        data.extent = extent;
        data.z = z;
        data.x = x;
        data.y = y;
        tile.name = `tile @ (z=${z}, x=${x}, y=${y})`;

        if (this.renderOrder !== undefined || this.renderOrder !== null) {
            tile.renderOrder = this.renderOrder;
        }
        data.parentEntity = this;
        tile.visible = false;

        // we initialize it with fake z to avoid a degenerate bounding box
        // the culling test will be done considering x and y only anyway.
        tile.userData.boundingBox = new Box3(
            new Vector3(extent.west(), extent.south(), -1),
            new Vector3(extent.east(), extent.north(), 1),
        );

        this.onTileCreated(tile);
        return tile;
    }

    preUpdate(_: Context, changeSources: Set<any>) {
        if (changeSources.has(undefined) || changeSources.size === 0) {
            return this.level0Nodes;
        }

        const nodeToUpdate = [];
        for (const source of changeSources.values()) {
            if (source.isCamera || source === this) {
                // if the change is caused by a camera move, no need to bother
                // to find common ancestor: we need to update the whole tree:
                // some invisible tiles may now be visible
                return this.level0Nodes;
            }

            if (source.userData && source.userData.parentEntity === this) {
                nodeToUpdate.push(source);
            }
        }
        if (nodeToUpdate.length > 0) {
            return nodeToUpdate;
        }
        return this.level0Nodes;
    }

    update(ctx: Context, node: Group) {
        if (!node.parent) {
            // if node has been removed dispose three.js resource
            for (const child of node.children) {
                // I want to exclude null or undefined, but include 0
                /* eslint-disable-next-line eqeqeq */
                if (!child.userData.isTile && child.userData.id != null) {
                    this._tileIdSet.delete(child.userData.id);
                }
            }
            // ok I'm misleading typescript here: in rigor this callback will be called with obj:
            // Object3D. Actually, I'm interested in cleaning Object3D that have geometries, which
            // are - at the time of writing - Mesh, Points and Line. Advantage, if three.js (ever)
            // adds another Object3D subclass with geometry or material, this code will work.
            node.traverse((obj: Mesh | Line | Points) => {
                if (obj.geometry) {
                    obj.geometry.dispose();
                }
                if (Array.isArray(obj.material)) {
                    for (const m of obj.material) {
                        m.dispose();
                    }
                } else if (obj.material) {
                    obj.material.dispose();
                }
            });
            return null;
        }

        // initialisation
        if (node.userData.layerUpdateState == null) {
            node.userData.layerUpdateState = new LayerUpdateState();
        }

        // Are we visible ?
        if (!this.frozen) {
            const isVisible = ctx.camera.isBox3Visible(node.userData.boundingBox, node.matrixWorld);
            node.visible = isVisible;
        }

        // if not visible we can stop early
        if (!node.visible) {
            const toCleanup = [];
            for (const child of node.children) {
                node.remove(child);
                // let's tell the MainLoop about subtiles that need cleaning
                if (child.userData.isTile) {
                    toCleanup.push(child);
                }
            }
            return toCleanup;
        }

        // if we have children that are real data, update min and max distance
        if (node.children.filter((c: Mesh | Line | Points) => c.geometry != null).length > 0) {
            this.updateMinMaxDistance(ctx.distance.plane, node);
        }

        // Do we need stuff for ourselves?
        const ts = Date.now();

        // we are in the z range and we can try an update
        if (node.userData.z <= this.maxLevel
                && node.userData.z >= this.minLevel
                && node.userData.layerUpdateState.canTryUpdate(ts)) {
            node.userData.layerUpdateState.newTry();

            const request = () => new Promise((resolve, reject) => {
                let extent = node.userData.extent;
                if (this.dataProjection) {
                    extent = extent.as(this.dataProjection);
                }
                extent = OLUtils.toOLExtent(extent);

                (this.source as any).loader_(
                    extent,
                    /* resolution */ undefined,
                    ctx.instance.referenceCrs,
                    (features: Feature[]) => {
                        // if the node is not visible any more, don't bother
                        if (!node.visible) {
                            resolve(null);
                            return;
                        }
                        if (features.length === 0) {
                            resolve(null);
                            return;
                        }
                        const offset = new Vector3();
                        const geom = getFirstSimpleGeom(features[0].getGeometry());
                        const stride = geom.getStride();
                        const firstCoordinates = geom.getFirstCoordinate();
                        offset.x = firstCoordinates[0];
                        offset.y = firstCoordinates[1];

                        if (stride > 2) {
                            offset.z = firstCoordinates[2];
                        }
                        features.filter(f => !this._tileIdSet.has(f.getId()));

                        resolve(
                            OlFeature2Mesh.convert(features, {
                                offset,
                                elevation: this.elevation,
                                extrusionOffset: this.extrusionOffset,
                                style: this.style,
                                material: this.material,
                            }),
                        );
                    },
                    (err: Error) => reject(err),
                );
            });

            this._opCounter.increment();

            DefaultQueue.enqueue({
                id: node.uuid, // we only make one query per "tile"
                request,
                priority: performance.now(), // Last in first out, like in Layer.js
                shouldExecute: () => node.visible,
            })
                .then((result: Mesh[]) => {
                    if (!node.parent) {
                        // node have been removed before we got the result, cancelling
                        return;
                    }
                    // if request return empty json, result will be null
                    if (result) {
                        if (
                            node.children.filter(
                                n => n.userData.parentEntity === this && !n.userData.isTile,
                            ).length > 0
                        ) {
                            console.warn(
                                `We received results for this tile: ${node},`
                                + 'but it already contains children for the current entity.',
                            );
                        }
                        for (const mesh of result) {
                            this.onObjectCreated(mesh);

                            // call onMeshCreated callback if needed
                            if (this.onMeshCreated) {
                                this.onMeshCreated(mesh);
                            }

                            if (!this._tileIdSet.has(mesh.userData.id)
                                    // exclude null or undefined, but keep 0
                                    /* eslint-disable-next-line eqeqeq */
                                    || mesh.userData.id == null) {
                                this._tileIdSet.add(mesh.userData.id);
                                node.add(mesh);
                                node.userData.boundingBox.expandByObject(mesh);
                                this._instance.notifyChange(node);
                            }
                        }
                        node.userData.layerUpdateState.noMoreUpdatePossible();
                    } else {
                        node.userData.layerUpdateState.failure(1, true);
                    }
                })
                .catch(err => {
                    // Abort errors are perfectly normal, so we don't need to log them.
                    // However any other error implies an abnormal termination of the processing.
                    if (err.message === 'aborted') {
                        // the query has been aborted because giro3d thinks it doesn't need this any
                        // more, so we put back the state to IDLE
                        node.userData.layerUpdateState.success();
                    } else {
                        console.error(err);
                        node.userData.layerUpdateState.failure(Date.now(), true);
                    }
                })
                .finally(() => this._opCounter.decrement());
        }

        // Do we need children ?
        let requestChildrenUpdate = false;

        if (!this.frozen) {
            const s = node.userData.boundingBox.getSize(vector);
            const sse = ScreenSpaceError.computeFromBox3(
                ctx.camera,
                node.userData.boundingBox,
                node.matrixWorld,
                Math.max(s.x, s.y),
                ScreenSpaceError.Mode.MODE_2D,
            );

            node.userData.sse = sse; // DEBUG

            if (this.testTileSSE(node, sse)) {
                this.subdivideNode(ctx, node);
                setNodeContentVisible(node, false);
                requestChildrenUpdate = true;
            } else {
                setNodeContentVisible(node, true);
            }
        } else {
            requestChildrenUpdate = true;
        }

        // update uniforms
        if (!requestChildrenUpdate) {
            const toClean = [];
            for (const child of node.children.filter(c => c.userData.isTile)) {
                node.remove(child);
                toClean.push(child);
            }
            return toClean;
        }

        return requestChildrenUpdate
            ? node.children.filter(n => n.userData.parentEntity === this)
            : undefined;
    }

    private subdivideNode(context: Context, node: Group) {
        if (!node.children.some(n => n.userData.parentEntity === this)) {
            const extents = node.userData.extent.split(2, 2);

            let i = 0;
            const { x, y, z } = node.userData;
            for (const extent of extents) {
                let child;
                if (i === 0) {
                    child = this.buildNewTile(extent, z + 1, 2 * x + 0, 2 * y + 0);
                } else if (i === 1) {
                    child = this.buildNewTile(extent, z + 1, 2 * x + 0, 2 * y + 1);
                } else if (i === 2) {
                    child = this.buildNewTile(extent, z + 1, 2 * x + 1, 2 * y + 0);
                } else if (i === 3) {
                    child = this.buildNewTile(extent, z + 1, 2 * x + 1, 2 * y + 1);
                }
                node.add(child);

                child.updateMatrixWorld(true);
                i++;
            }
            context.instance.notifyChange(node);
        }
    }

    private testTileSSE(tile: Group, sse: { lengths: { x: number; y: number }; ratio: number }) {
        if (this.maxLevel >= 0 && this.maxLevel <= tile.userData.z) {
            return false;
        }

        if (!sse) {
            return true;
        }

        // the ratio is how much the tile appears compared to its real size. If you see it from the
        // side, the ratio is low. If you see it from above, the ratio is 1
        // lengths times ratio gives a normalized size
        // I don't exactly know what lengths contains, you have to understand
        // ScreenSpaceError.computeSSE for that :-) but I *think* it contains the real dimension of
        // the tile on screen. I'm really not sure though.
        // I don't know why we multiply the ratio
        const values = [sse.lengths.x * sse.ratio, sse.lengths.y * sse.ratio];

        // if one of the axis is too small on the screen, the test fail and we don't subdivise
        // sseScale allows to customize this at the entity level
        // 100 *might* be because  values are percentage?
        if (values.filter(v => v < 100 * tile.userData.parentEntity.sseScale).length >= 1) {
            return false;
        }
        // this is taken from Map: there, the subdivision follows the same logic as openlayers:
        // subdividing when a tile reach 384px (assuming you're looking at it top-down of course, in
        // 3D it's different).
        // For Features, it makes less sense, but it "works". We might want to revisit that later,
        // especially because this and the sseThreshold are not easy to use for developers.
        return values.filter(v => v >= 384 * tile.userData.parentEntity.sseScale).length >= 2;
    }

    private updateMinMaxDistance(cameraPlane: Plane, node: Group) {
        const bbox = node.userData.boundingBox.clone().applyMatrix4(node.matrixWorld);
        const distance = cameraPlane.distanceToPoint(bbox.getCenter(vector));
        const radius = bbox.getSize(vector).length() * 0.5;
        this._distance.min = Math.min(this._distance.min, distance - radius);
        this._distance.max = Math.max(this._distance.max, distance + radius);
    }
}

export default FeatureCollection;
