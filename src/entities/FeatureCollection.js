/**
 * @module entities/FeatureCollection
 */
import {
    Vector3,
    Box3,
    Group,
} from 'three';

import Extent from '../core/geographic/Extent';
import ScreenSpaceError from '../core/ScreenSpaceError.js';
import LayerUpdateState from '../core/layer/LayerUpdateState.js';
import Entity3D from './Entity3D.js';
import OperationCounter from '../core/OperationCounter';
import { DefaultQueue } from '../core/RequestQueue';
import OlFeature2Mesh from '../renderer/extensions/OlFeature2Mesh.js';
import ObjectRemovalHelper from '../utils/ObjectRemovalHelper.js';
import OLUtils from '../utils/OpenLayersUtils.js';

const vector = new Vector3();
function subdivideNode(context, entity, node) {
    if (!node.children.some(n => n.userData.parentEntity === entity)) {
        const extents = node.extent.split(2, 2);

        let i = 0;
        const { x, y, z } = node;
        for (const extent of extents) {
            let child;
            if (i === 0) {
                child = entity.buildNewTile(
                    extent, node, z + 1, 2 * x + 0, 2 * y + 0,
                );
            } else if (i === 1) {
                child = entity.buildNewTile(
                    extent, node, z + 1, 2 * x + 0, 2 * y + 1,
                );
            } else if (i === 2) {
                child = entity.buildNewTile(
                    extent, node, z + 1, 2 * x + 1, 2 * y + 0,
                );
            } else if (i === 3) {
                child = entity.buildNewTile(
                    extent, node, z + 1, 2 * x + 1, 2 * y + 1,
                );
            }
            node.add(child);

            child.updateMatrixWorld(true);
            i++;
        }
        context.instance.notifyChange(node);
    }
}

function setNodeContentVisible(node, visible) {
    for (const child of node.children) {
        if (!child.userData.isTile && child.material) {
            child.visible = visible;
        }
    }
}

function selectBestSubdivisions(map, extent) {
    const dims = extent.dimensions();
    const ratio = dims.x / dims.y;
    let x = 1; let y = 1;
    if (ratio > 1) {
        // Our extent is an horizontal rectangle
        x = Math.round(ratio);
    } else if (ratio < 1) {
        // Our extent is an vertical rectangle
        y = Math.round(1 / ratio);
    }

    return { x, y };
}

/**
 * A FeatureCollection is an {@link module:entities/Entity~Entity Entity} that manages 2.5D features
 * as 3D meshes in giro3D scene.
 *
 * In this context, 2.5D means that there is only one Z per x,y coordinates in the source data. So
 * this deals with lines, polyline, (multi)polygons and points.
 *
 * This entity will represent them as 3D object as-is, but an altitude can be set (see
 * `options.altitude` in the constructor), if not already in the source coordinates.
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
 * const vectorSource = new VectorSource({
 *  // ...
 * });
 * const featureCollection = new FeatureCollection('features', {
 *  source: vectorSource
 *  minLevel: 10,
 *  maxLevel: 10,
 *  altitude: 10,
 * });
 *
 * instance.add(featureCollection);
 *
 * ```
 *
 * Related examples:
 *
 * - [WFS as 3D meshes](/examples/wfs_mesh.html)
 *
 * @api
 */
class FeatureCollection extends Entity3D {
    /**
     * This callback is called just after a source data has been converted to a THREE.js Mesh
     *
     * @typedef {Function} OnMeshCreatedCallback
     * @param {module:THREE.Mesh} mesh the created
     * [THREE.Mesh](https://threejs.org/docs/#api/objects/Mesh)
     */
    /**
     * This callback is called to get the altitude of a feature, if the coordinates are 2D.
     *
     * @typedef {Function} FeatureAltitudeCallback
     * @param {module:ol.Feature} feature an
     * [ol.Feature](https://openlayers.org/en/latest/apidoc/module-ol_Feature-Feature.html)
     * @returns {(number|Array<number>)} an altitude or an array of altitude to set the geometry of
     * the mesh to. If this function returns an array, each vertex will be set to its altitude in
     * the same order.
     */
    /**
     * @typedef {object} StyleObject
     * @property {module:THREE.Color} [color] How to color the current feature
     * @property {boolean} visible if the current feature should be visible or not
     */
    /**
     * This callback is called just after a source data has been converted to a THREE.js Mesh, to
     * color individual meshes.
     *
     * @typedef {Function} StyleCallback
     * @param {module:ol.Feature} feature the feature to style
     * @returns {StyleObject} The style of the current feature
     */

    /**
     *
     * Construct a `FeatureCollection`.
     *
     * @param {string} id The unique identifier of this FeatureCollection
     * @param {object} [options={}] Constructor options.
     * @param {Extent} options.extent The geographic extent of the map, mandatory.
     * @param {module:THREE.Object3D} [options.object3d=new THREE.Group()] The optional 3d object to
     * use as the root
     * @param {number} [options.minLevel=0] The min subdivision level to start processing features.
     * Useful for WFS or other untiled servers, to avoid to download the entire dataset when the
     * whole extent is visible.
     * @param {number} [options.maxLevel=Infinity] The max level to subdivide the extent and
     * process features.
     * @param {OnMeshCreatedCallback} [options.onMeshCreated] called when a mesh is created (just
     * after conversion of the source data)
     * @param {module:THREE.Material} [options.material] the [THREE.Material](https://threejs.org/docs/#api/en/materials/Material) to use for meshes
     * @param {number|FeatureAltitudeCallback} [options.altitude] Set the altitude of the features
     * received from the source. It can be a constant for every feature, or a callback. The callback
     * version is particularly useful to derive the altitude from the properties of the feature.
     * @param {StyleCallback|StyleObject} [options.style] an object or a callback returning such
     * object to style the individual feature. If an object is returned, the informations it
     * contains will be used to style every feature the same way. If a callback is provided, it
     * will be called with the feature. This allows to individually style each feature.
     */
    constructor(id, options = {}) {
        super(id, options.object3d || new Group());

        if (!options.extent) {
            throw new Error(
                `Error while initializing FeatureCollection with id "${id}": missing options.extent`,
            );
        }
        if (!options.extent.isValid()) {
            throw new Error('Invalid extent: minX must be less than maxX and minY must be less than maxY.');
        }
        /** @type {Extent} */
        this.extent = options.extent;
        this.subdivisions = selectBestSubdivisions(this, this.extent);

        this.maxLevel = options.maxLevel ?? Infinity;
        this.minLevel = options.minLevel ?? 0;

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
        this._convert = OlFeature2Mesh.convert({
            material: options.material,
            altitude: options.altitude,
            style: options.style,
        });

        this._opCounter = new OperationCounter();
    }

    preprocess() {
        // If the map is not square, we want to have more than a single
        // root tile to avoid elongated tiles that hurt visual quality and SSE computation.
        const rootExtents = this.extent.split(this.subdivisions.x, this.subdivisions.y);

        let i = 0;
        for (const root of rootExtents) {
            if (this.subdivisions.x > this.subdivisions.y) {
                this.level0Nodes.push(
                    this.buildNewTile(root, undefined, 0, i, 0),
                );
            } else if (this.subdivisions.y > this.subdivisions.x) {
                this.level0Nodes.push(
                    this.buildNewTile(root, undefined, 0, 0, i),
                );
            } else {
                this.level0Nodes.push(
                    this.buildNewTile(root, undefined, 0, 0, 0),
                );
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

    buildNewTile(extent, parent, z, x = 0, y = 0) {
        // create a simple square shape. We duplicate the top left and bottom right
        // vertices because each vertex needs to appear once per triangle.
        extent = extent.as(this._instance.referenceCrs);
        const tile = new Group();
        tile.userData.isTile = true;
        tile.extent = extent;
        tile.z = z;
        tile.x = x;
        tile.y = y;

        if (this.renderOrder !== undefined) {
            tile.renderOrder = this.renderOrder;
        }
        tile.traverse(o => { o.opacity = this.opacity; });
        tile.userData.parentEntity = this;
        tile.visible = false;

        // we initialize it with fake z to avoid a degenerate bounding box
        // the culling test will be done considering x and y only anyway.
        tile.boundingBox = new Box3(
            new Vector3(extent.west(), extent.south(), -1),
            new Vector3(extent.east(), extent.north(), 1),
        );

        this.onTileCreated(this, parent, tile);
        return tile;
    }

    preUpdate(context, changeSources) {
        if (changeSources.has(undefined) || changeSources.size === 0) {
            return this.level0Nodes;
        }

        let commonAncestor;
        for (const source of changeSources.values()) {
            if (source.isCamera || source === this) {
                // if the change is caused by a camera move, no need to bother
                // to find common ancestor: we need to update the whole tree:
                // some invisible tiles may now be visible
                return this.level0Nodes;
            }
            if (source.userData && source.userData.parentEntity === this) {
                if (!commonAncestor) {
                    commonAncestor = source;
                } else {
                    commonAncestor = source.findCommonAncestor(commonAncestor);
                    if (!commonAncestor) {
                        return this.level0Nodes;
                    }
                }
                if (commonAncestor.material == null) {
                    commonAncestor = undefined;
                }
            }
        }
        if (commonAncestor) {
            if (__DEBUG__) {
                this._latestUpdateStartingLevel = commonAncestor.z;
            }
            return [commonAncestor];
        }
        return this.level0Nodes;
    }

    update(ctx, node) {
        if (!node.parent) {
            // if node has been removed dispose three.js resource
            ObjectRemovalHelper.removeChildrenAndCleanupRecursively(this, node);
            return null;
        }

        // initialisation
        if (node.layerUpdateState === undefined) {
            node.layerUpdateState = new LayerUpdateState();
        }

        if (ctx.fastUpdateHint) {
            if (!ctx.fastUpdateHint.isAncestorOf(node)) {
                // if visible, children bbox can only be smaller => stop updates
                if (node.material.visible) {
                    this.updateMinMaxDistance(ctx, node);
                    return null;
                }
                if (node.visible) {
                    return node.children.filter(n => n.userData.parentEntity === this);
                }
                return null;
            }
        }

        // Are we visible ?
        if (!this.frozen) {
            const isVisible = ctx.camera.isBox3Visible(
                node.boundingBox, node.matrixWorld,
            );
            node.visible = isVisible;
        }

        // if not visible we can stop early
        if (!node.visible) {
            const toCleanup = [];
            for (const child of node.children.filter(c => c.isTile)) {
                node.remove(child);
                // let's tell the MainLoop about subtiles that need cleaning
                if (child.userData.isTile) {
                    toCleanup.push(child);
                }
            }
            return toCleanup;
        }

        // if we have children that are real data, update min and max distance
        if (node.children.filter(c => !!c.geometry).length > 0) {
            this.updateMinMaxDistance(ctx, node);
        }

        // Do we need stuff for ourselves?
        const ts = Date.now();

        // we are in the z range and we can try an update
        if (node.z <= this.maxLevel
                && node.z >= this.minLevel
                && node.layerUpdateState.canTryUpdate(ts)) {
            node.layerUpdateState.newTry();

            const request = () => new Promise((resolve, reject) => {
                const source = this.source;
                const extent = OLUtils.toOLExtent(node.extent);
                this.source.loader_(
                    extent, /* resolution */ undefined,
                    source.getProjection(),
                    features => {
                        if (features.length === 0) {
                            resolve(null);
                            return;
                        }
                        const offset = new Vector3();
                        const geom = features[0].getGeometry();
                        offset.x = geom.flatCoordinates[0];
                        offset.y = geom.flatCoordinates[1];
                        if (geom.stride > 2) {
                            offset.z = geom.flatCoordinates[2];
                        }
                        resolve(this._convert(features, offset));
                    }, err => reject(err),
                );
            });

            this._opCounter.increment();

            DefaultQueue.enqueue({
                id: node.uuid, // we only make one query per "tile"
                request,
                priority: performance.now(), // Last in first out, like in Layer.js
                shouldExecute: () => node.visible,
            }).then(result => {
                if (!node.parent) {
                    // node have been removed before we got the result, cancelling
                    return;
                }
                // if request return empty json, result will be null
                if (result) {
                    if (node.children.filter(n => n.userData.parentEntity === this && !n.isTile)
                        .length > 0) {
                        console.warning(`We received results for this tile: ${node},`
                            + 'but it already contains children for the current entity.');
                    }
                    for (const mesh of result) {
                        this.onObjectCreated(mesh);

                        // call onMeshCreated callback if needed
                        if (this.onMeshCreated) {
                            this.onMeshCreated(mesh);
                        }

                        node.add(mesh);
                        node.boundingBox.expandByObject(mesh);
                        this._instance.notifyChange(this);
                    }
                    node.layerUpdateState.noMoreUpdatePossible();
                } else {
                    node.layerUpdateState.failure(1, true);
                }
            }).catch(err => {
                // Abort errors are perfectly normal, so we don't need to log them.
                // However any other error implies an abnormal termination of the processing.
                if (err.message === 'aborted') {
                    // the query has been aborted because giro3d thinks it doesn't need this any
                    // more, so we put back the state to IDLE
                    node.layerUpdateState.success();
                } else {
                    console.error(err);
                    node.layerUpdateState.failure(Date.now(), true);
                }
            }).finally(() => this._opCounter.decrement());
        }

        // Do we need children ?
        let requestChildrenUpdate = false;

        if (!this.frozen) {
            const s = node.boundingBox.getSize(vector);
            const sse = ScreenSpaceError.computeFromBox3(
                ctx.camera,
                node.boundingBox,
                node.matrixWorld,
                Math.max(s.x, s.y),
                ScreenSpaceError.MODE_2D,
            );

            node.sse = sse; // DEBUG

            if (this.testTileSSE(node, sse)) {
                subdivideNode(ctx, this, node);
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
            ? node.children.filter(n => n.userData.parentEntity === this) : undefined;
    }

    testTileSSE(tile, sse) {
        if (this.maxLevel >= 0 && this.maxLevel <= tile.z) {
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
        const values = [
            sse.lengths.x * sse.ratio,
            sse.lengths.y * sse.ratio,
        ];

        // if one of the axis is too small on the screen, the test fail and we don't subdivise
        // sseScale allows to customize this at the entity level
        // 100 *might* be because  values are percentage?
        if (values.filter(v => v < (100 * tile.userData.parentEntity.sseScale)).length >= 1) {
            return false;
        }
        // this is taken from Map: there, the subdivision follows the same logic as openlayers:
        // subdividing when a tile reach 384px (assuming you're looking at it top-down of course, in
        // 3D it's different).
        // For Features, it makes less sense, but it "works". We might want to revisit that later,
        // especially because this and the sseThreshold are not easy to use for developers.
        return values.filter(v => v >= (384 * tile.userData.parentEntity.sseScale)).length >= 2;
    }

    updateMinMaxDistance(context, node) {
        const bbox = node.boundingBox.clone()
            .applyMatrix4(node.matrixWorld);
        const distance = context.distance.plane
            .distanceToPoint(bbox.getCenter(vector));
        const radius = bbox.getSize(vector).length() * 0.5;
        this._distance.min = Math.min(this._distance.min, distance - radius);
        this._distance.max = Math.max(this._distance.max, distance + radius);
    }
}

export default FeatureCollection;
