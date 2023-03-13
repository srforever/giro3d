/**
 * @module entities/Map
 */
import {
    Vector3,
    Quaternion,
    Group,
    Color,
    MathUtils,
} from 'three';

import Extent from '../core/geographic/Extent.js';
import Layer from '../core/layer/Layer.js';
import ColorLayer from '../core/layer/ColorLayer.js';
import ElevationLayer from '../core/layer/ElevationLayer.js';
import Entity3D from './Entity3D.js';
import ObjectRemovalHelper from '../process/ObjectRemovalHelper.js';
import Picking from '../core/Picking.js';
import ScreenSpaceError from '../core/ScreenSpaceError.js';
import LayeredMaterial from '../renderer/LayeredMaterial.js';
import TileMesh from '../core/TileMesh.js';
import TileIndex from '../core/TileIndex.js';
import RenderingState from '../renderer/RenderingState.js';
import ColorMapAtlas from '../renderer/ColorMapAtlas.js';

const DEFAULT_BACKGROUND_COLOR = new Color(0.04, 0.23, 0.35);

/**
 * The maximum supported aspect ratio for the map tiles, before we stop trying to create square
 * tiles. This is a safety measure to avoid huge number of root tiles when the extent is a very
 * elongated rectangle. If the map extent has a greater ratio than this value, the generated tiles
 * will not be square-ish anymore.
 */
const MAX_SUPPORTED_ASPECT_RATIO = 10;

/**
 * Fires when a layer is added to the map.
 *
 * @api
 * @event Map#layer-added
 * @example
 * map.addEventListener('layer-added', () => console.log('layer added!'));
 */

/**
 * Fires when a layer is removed from the map.
 *
 * @api
 * @event Map#layer-removed
 * @example
 * map.addEventListener('layer-removed', () => console.log('layer removed!'));
 */

const tmpVector = new Vector3();

function subdivideNode(context, map, node) {
    if (!node.children.some(n => n.layer === map)) {
        const extents = node.extent.split(2, 2);

        let i = 0;
        const { x, y, z } = node;
        for (const extent of extents) {
            let child;
            if (i === 0) {
                child = map.requestNewTile(
                    extent, node, z + 1, 2 * x + 0, 2 * y + 0,
                );
            } else if (i === 1) {
                child = map.requestNewTile(
                    extent, node, z + 1, 2 * x + 0, 2 * y + 1,
                );
            } else if (i === 2) {
                child = map.requestNewTile(
                    extent, node, z + 1, 2 * x + 1, 2 * y + 0,
                );
            } else if (i === 3) {
                child = map.requestNewTile(
                    extent, node, z + 1, 2 * x + 1, 2 * y + 1,
                );
            }
            node.add(child);

            // inherit our parent's textures
            for (const e of map.getElevationLayers()) {
                e.update(context, child, node, true);
            }
            if (node.material.pixelWidth > 0) {
                for (const c of map.getColorLayers()) {
                    c.update(context, child, node, true);
                }
            }

            child.updateMatrixWorld(true);
            i++;
        }
        context.instance.notifyChange(node);
    }
}

function selectBestSubdivisions(map, extent) {
    const dims = extent.dimensions();
    const ratio = dims.x / dims.y;
    let x = 1; let y = 1;
    if (ratio > 1) {
        // Our extent is an horizontal rectangle
        x = Math.min(Math.round(ratio), MAX_SUPPORTED_ASPECT_RATIO);
    } else if (ratio < 1) {
        // Our extent is an vertical rectangle
        y = Math.min(Math.round(1 / ratio), MAX_SUPPORTED_ASPECT_RATIO);
    }

    return { x, y };
}

/**
 * Compute the best image size for tiles, taking into account the extent ratio.
 * In other words, rectangular tiles will have more pixels in their longest side.
 *
 * @param {Extent} extent The map extent.
 */
function computeImageSize(extent) {
    const baseSize = 256;
    const dims = extent.dimensions();
    const ratio = dims.x / dims.y;
    if (Math.abs(ratio - 1) < 0.01) {
        // We have a square tile
        return { w: baseSize, h: baseSize };
    }

    if (ratio > 1) {
        const actualRatio = Math.min(ratio, MAX_SUPPORTED_ASPECT_RATIO);
        // We have an horizontal tile
        return { w: Math.round(baseSize * actualRatio), h: baseSize };
    }

    const actualRatio = Math.min(1 / ratio, MAX_SUPPORTED_ASPECT_RATIO);

    // We have a vertical tile
    return { w: baseSize, h: Math.round(baseSize * actualRatio) };
}

/**
 * A map is an {@link module:entities/Entity~Entity Entity} that represents a flat
 * surface displaying one or more {@link module:Core/layer/Layer~Layer Layers}.
 *
 * If an elevation layer is added, the surface of the map is deformed to
 * display terrain.
 *
 * @api
 */
class Map extends Entity3D {
    /**
     * Constructs a Map object.
     *
     * @param {string} id The unique identifier of the map.
     * @param {object} options Constructor options.
     * @param {Extent} options.extent The geographic extent of the map.
     * @param {number} [options.maxSubdivisionLevel=-1] Maximum tile depth of the map.
     * A value of `-1` does not limit the depth of the tile hierarchy.
     * @param {boolean} [options.hillshading=false] Enables [hillshading](https://earthquake.usgs.gov/education/geologicmaps/hillshades.php).
     * Note: for hillshading to work, there must be an elevation layer in the map.
     * @param {number} [options.segments=8] The number of geometry segments in each map tile.
     * The higher the better. It *must* be power of two between `1` included and `256` included.
     * Note: the number of vertices per tile side is `segments` + 1.
     * @param {boolean} [options.doubleSided=false] If `true`, both sides of the map will be
     * rendered, i.e when looking at the map from underneath.
     * @param {boolean} [options.discardNoData=false] If `true`, parts of the map that relate to
     * no-data elevation values are not displayed. Note: you should only set this value to `true` if
     * an elevation layer is present, otherwise the map will never be displayed.
     * @param {module:three.Object3D=} options.object3d The optional 3d object to use as the root
     * object of this map. If none provided, a new one will be created.
     * @param {string} [options.backgroundColor=undefined] The color of the map when no color layers
     * are present.
     * @api
     */
    constructor(id, options = {}) {
        super(id, options.object3d || new Group());

        /** @type {Array<TileMesh>} */
        this.level0Nodes = [];

        this.geometryPool = new window.Map();

        /** @type {Extent} */
        if (!options.extent.isValid()) {
            throw new Error('Invalid extent: minX must be less than maxX and minY must be less than maxY.');
        }
        this.extent = options.extent;

        this.subdivisions = selectBestSubdivisions(this, this.extent);

        this.sseScale = 1.5;
        this.maxSubdivisionLevel = options.maxSubdivisionLevel || -1;

        this.type = 'Map';
        this.visible = true;

        this.lightDirection = { azimuth: 315, zenith: 45 };

        this.showOutline = options.showOutline;

        this._segments = options.segments || 8;

        this.materialOptions = {
            hillshading: options.hillshading || false,
            discardNoData: options.discardNoData || false,
            doubleSided: options.doubleSided || false,
            segments: this.segments,
            backgroundColor: options.backgroundColor !== undefined
                ? new Color(options.backgroundColor)
                : DEFAULT_BACKGROUND_COLOR.clone(),
        };

        this.currentAddedLayerIds = [];
        this.tileIndex = new TileIndex();
    }

    get segments() {
        return this._segments;
    }

    set segments(v) {
        if (this._segments !== v) {
            if (MathUtils.isPowerOfTwo(v) && v >= 1 && v <= 128) {
                // Delete cached geometries that just became obsolete
                this._clearGeometryPool();
                this._segments = v;
                this._updateGeometries();
            } else {
                throw new Error('invalid segments. Must be a power of two between 1 and 128 included');
            }
        }
    }

    _clearGeometryPool() {
        this.geometryPool.forEach(v => v.dispose());
        this.geometryPool.clear();
    }

    _updateGeometries() {
        for (const r of this.level0Nodes) {
            r.traverse(obj => {
                /** @type {TileMesh} */
                const tile = obj;
                if (tile.layer !== this) {
                    return;
                }
                if (tile.segments) {
                    tile.segments = this.segments;
                }
            });
        }
    }

    preprocess() {
        this.onTileCreated = this.onTileCreated || (() => {});

        // If the map is not square, we want to have more than a single
        // root tile to avoid elongated tiles that hurt visual quality and SSE computation.
        const rootExtents = this.extent.split(this.subdivisions.x, this.subdivisions.y);

        this.imageSize = computeImageSize(rootExtents[0]);

        const promises = [];

        let i = 0;
        for (const root of rootExtents) {
            if (this.subdivisions.x > this.subdivisions.y) {
                promises.push(
                    this.requestNewTile(root, undefined, 0, i, 0),
                );
            } else if (this.subdivisions.y > this.subdivisions.x) {
                promises.push(
                    this.requestNewTile(root, undefined, 0, 0, i),
                );
            } else {
                promises.push(
                    this.requestNewTile(root, undefined, 0, 0, 0),
                );
            }
            i++;
        }
        return Promise.all(promises).then(level0s => {
            this.level0Nodes = level0s;
            for (const level0 of level0s) {
                this.object3d.add(level0);
                level0.updateMatrixWorld();
            }
            return this;
        });
    }

    requestNewTile(extent, parent, level, x = 0, y = 0) {
        if (parent && !parent.material) {
            return null;
        }

        const quaternion = new Quaternion();
        const position = new Vector3(...extent.center()._values);

        // build tile
        const material = new LayeredMaterial(
            this.materialOptions, this._instance.renderer, this.atlasInfo,
        );

        const tile = new TileMesh(this, material, extent, this.segments, level, x, y);

        if (this.renderOrder !== undefined) {
            tile.renderOrder = this.renderOrder;
        }
        tile.material.opacity = this.opacity;

        if (parent && parent instanceof TileMesh) {
            // get parent position from extent
            const positionParent = new Vector3(...parent.extent.center()._values);
            // place relative to his parent
            position.sub(positionParent).applyQuaternion(parent.quaternion.invert());
            quaternion.premultiply(parent.quaternion);
        }

        tile.position.copy(position);
        tile.quaternion.copy(quaternion);

        tile.opacity = this.opacity;
        tile.setVisibility(false);
        tile.updateMatrix();

        tile.material.showOutline = this.showOutline || false;
        tile.material.wireframe = this.wireframe || false;

        if (parent) {
            tile.setBBoxZ(parent.OBB().z.min, parent.OBB().z.max);
        } else {
            // TODO: probably not here
            // TODO get parentGeometry from layer
            const elevation = this.getLayers(l => l instanceof ElevationLayer);
            if (elevation.length > 0) {
                if (!elevation[0].minmax) {
                    console.error('fix the provider');
                }
                tile.setBBoxZ(elevation[0].minmax.min, elevation[0].minmax.max);
            }
        }

        tile.add(tile.OBB());
        this.onTileCreated(this, parent, tile);

        return tile;
    }

    /**
     * Sets the render state of the map.
     *
     * @param {RenderingState} state The new state.
     * @returns {Function} The function to revert to the previous state.
     */
    setRenderState(state) {
        const restores = this.level0Nodes.map(n => n.pushRenderState(state));

        return () => {
            restores.forEach(r => r());
        };
    }

    pickObjectsAt(coordinates, options, target) {
        return Picking.pickTilesAt(
            this._instance,
            coordinates,
            this,
            options,
            target,
        );
    }

    preUpdate(context, changeSources) {
        context.colorLayers = this.getLayers(
            (l, a) => a && a.id === this.id && l instanceof ColorLayer,
        );
        context.elevationLayers = this.getLayers(
            (l, a) => a && a.id === this.id && l instanceof ElevationLayer,
        );

        if (__DEBUG__) {
            this._latestUpdateStartingLevel = 0;
        }

        this.materialOptions.colorMapAtlas?.update();

        this.tileIndex.update();

        if (changeSources.has(undefined) || changeSources.size === 0) {
            return this.level0Nodes;
        }

        let commonAncestor;
        for (const source of changeSources.values()) {
            if (source.isCamera) {
                // if the change is caused by a camera move, no need to bother
                // to find common ancestor: we need to update the whole tree:
                // some invisible tiles may now be visible
                return this.level0Nodes;
            }
            if (source.layer === this.id) {
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
                this._latestUpdateStartingLevel = commonAncestor.level;
            }
            return [commonAncestor];
        }
        return this.level0Nodes;
    }

    update(context, node) {
        if (!node.parent) {
            return ObjectRemovalHelper.removeChildrenAndCleanup(this, node);
        }

        if (context.fastUpdateHint) {
            if (!context.fastUpdateHint.isAncestorOf(node)) {
                // if visible, children bbox can only be smaller => stop updates
                if (node.material.visible) {
                    this.updateMinMaxDistance(context, node);
                    return null;
                }
                if (node.visible) {
                    return node.children.filter(n => n.layer === this);
                }
                return null;
            }
        }

        // do proper culling
        if (!this.frozen) {
            const isVisible = context.camera.isBox3Visible(
                node.OBB().box3D, node.OBB().matrixWorld,
            );
            node.visible = isVisible;
        }

        if (node.visible) {
            let requestChildrenUpdate = false;

            if (!this.frozen) {
                const s = node.OBB().box3D.getSize(tmpVector);
                const obb = node.OBB();
                const sse = ScreenSpaceError.computeFromBox3(
                    context.camera,
                    obb.box3D,
                    obb.matrixWorld,
                    Math.max(s.x, s.y),
                    ScreenSpaceError.MODE_2D,
                );

                node.sse = sse; // DEBUG

                if (this.testTileSSE(node, sse)
                    && this.hasEnoughTexturesToSubdivide(context, node)) {
                    subdivideNode(context, this, node);
                    // display iff children aren't ready
                    node.setDisplayed(false);
                    requestChildrenUpdate = true;
                } else {
                    node.setDisplayed(true);
                }
            } else {
                requestChildrenUpdate = true;
            }

            if (node.material.visible) {
                node.material.lightDirection = this.lightDirection;
                node.material.update(this.materialOptions);

                this.updateMinMaxDistance(context, node);

                // update uniforms
                if (!requestChildrenUpdate) {
                    return ObjectRemovalHelper.removeChildren(this, node);
                }
            }

            // TODO: use Array.slice()
            return requestChildrenUpdate ? node.children.filter(n => n.layer === this) : undefined;
        }

        node.setDisplayed(false);
        return ObjectRemovalHelper.removeChildren(this, node);
    }

    postUpdate() {
        for (const r of this.level0Nodes) {
            r.traverse(obj => {
                /** @type {TileMesh} */
                const tile = obj;
                if (tile.layer !== this || !tile.material.visible) {
                    return;
                }
                const neighbours = this.tileIndex.getNeighbours(tile);
                tile.processNeighbours(neighbours);
            });
        }
    }

    // TODO this whole function should be either in providers or in layers

    /**
     * Adds a layer, then returns the created layer.
     * Before using this method, make sure that the map is added in an instance.
     * If the extent or the projection of the layer is not provided,
     * those values will be inherited from the map.
     *
     * @param {module:Core/layer/Layer~Layer} layer an object describing the layer options creation
     * @returns {Promise} a promise resolving when the layer is ready
     * @api
     */
    addLayer(layer) {
        return new Promise((resolve, reject) => {
            if (!this._instance) {
                reject(new Error('map is not attached to an instance'));
                return;
            }

            if (!(layer instanceof Layer)) {
                reject(new Error('layer is not an instance of Layer'));
                return;
            }
            const duplicate = this.getLayers((l => l.id === layer.id));
            if (duplicate.length > 0 || this.currentAddedLayerIds.includes(layer.id)) {
                reject(new Error(`Invalid id '${layer.id}': id already used`));
                return;
            }
            this.currentAddedLayerIds.push(layer.id);

            if (!layer.extent) {
                layer.extent = this.extent;
            }
            if (!layer.projection) {
                layer.projection = this.projection;
            }
            layer.instance = this._instance;
            layer.imageSize = this.imageSize;

            this.attach(layer);

            if (layer.colorMap) {
                if (!this.materialOptions.colorMapAtlas) {
                    this.materialOptions.colorMapAtlas = new ColorMapAtlas(this._instance.renderer);
                }
                this.materialOptions.colorMapAtlas.add(layer.colorMap);
            }

            layer.whenReady.then(l => {
                if (!this.currentAddedLayerIds.includes(layer.id)) {
                    // The layer was removed, stop attaching it.
                    return;
                }

                this._instance.notifyChange(this, false);
                this.dispatchEvent({ type: 'layer-added' });
                resolve(l);
            }).catch(r => {
                reject(r);
            }).then(() => {
                this.currentAddedLayerIds = this.currentAddedLayerIds.filter(l => l !== layer.id);
            });
        });
    }

    /**
     * Removes a layer from the map.
     *
     * @param {Layer} layer the layer to remove
     * @returns {boolean} `true` if the layer was present, `false` otherwise.
     * @api
     */
    removeLayer(layer) {
        this.currentAddedLayerIds = this.currentAddedLayerIds.filter(l => l !== layer.id);
        if (this.detach(layer)) {
            if (layer.colorMap) {
                this.materialOptions.colorMapAtlas.remove(layer.colorMap);
            }
            layer.dispose(this);
            this.dispatchEvent({ type: 'layer-removed' });
            this._instance.notifyChange(this, true);
            return true;
        }

        return false;
    }

    /**
     * Gets all layers that satisfy the filter predicate.
     *
     * @api
     * @param {Function} [filter] the optional filter
     * @returns {Array<Layer>} the layers that matched the predicate,
     * or all layers if no predicate was provided.
     */
    getLayers(filter) {
        const result = [];
        for (const layer of this._attachedLayers) {
            if (!filter || filter(layer)) {
                result.push(layer);
            }
        }
        return result;
    }

    /**
     * Gets all color layers in this map.
     *
     * @api
     * @returns {Array<Layer>} the color layers
     */
    getColorLayers() {
        return this.getLayers(l => l instanceof ColorLayer);
    }

    /**
     * Gets all elevation layers in this map.
     *
     * @api
     * @returns {Array<Layer>} the color layers
     */
    getElevationLayers() {
        return this.getLayers(l => l instanceof ElevationLayer);
    }

    /**
     * Disposes all layers in the map.
     */
    dispose() {
        for (const layer of this.getLayers()) {
            layer.dispose(this);
        }

        // Delete cached TileGeometry objects. This is not possible to do
        // at the TileMesh level because TileMesh objects do not own their geometry,
        // as it is shared among all tiles at the same depth level.
        this._clearGeometryPool();

        this.materialOptions.colorMapAtlas?.dispose();
    }

    /**
     * The min/max elevation values.
     *
     * @typedef {object} MinMax
     * @property {number} min The minimum elevation.
     * @property {number} max The maximum elevation.
     */

    /**
     * Returns the minimal and maximal elevation values in this map, in meters.
     *
     * If there is no elevation layer present, returns `{ min: 0, max: 0 }`.
     *
     * @api
     * @returns {MinMax} The min/max value.
     */
    getElevationMinMax() {
        const elevationLayers = this.getElevationLayers();
        if (elevationLayers.length > 0) {
            let min = Infinity;
            let max = -Infinity;

            for (const layer of elevationLayers) {
                min = Math.min(min, layer.minmax.min);
                max = Math.max(max, layer.minmax.max);
            }

            return { min, max };
        }
        return { min: 0, max: 0 };
    }

    hasEnoughTexturesToSubdivide(context, node) {
        // Prevent subdivision if node is covered by at least one elevation layer
        // and if node doesn't have a elevation texture yet.
        for (const e of context.elevationLayers) {
            if (!e.frozen && e.ready && e.tileInsideLimit(node, e)
                && !node.material.isElevationLayerTextureLoaded(e)) {
                // no stop subdivision in the case of a loading error
                if (node.layerUpdateState[e.id] && node.layerUpdateState[e.id].inError()) {
                    continue;
                }
                return false;
            }
        }

        if (node.children.some(n => n.layer === this)) {
            // No need to prevent subdivision, since we've already done it before
            return true;
        }

        // Prevent subdivision if missing color texture
        /* for (const c of context.colorLayers) {
            if (c.frozen || !c.visible || !c.ready) {
                continue;
            }
            // no stop subdivision in the case of a loading error
            if (node.layerUpdateState[c.id] && node.layerUpdateState[c.id].inError()) {
                continue;
            }
            if (c.tileInsideLimit(node, c) && !node.material.isColorLayerTextureLoaded(c)) {
                return false;
            }
            } */
        return true;
    }

    testTileSSE(tile, sse) {
        if (this.maxSubdivisionLevel > 0 && this.maxSubdivisionLevel <= tile.level) {
            return false;
        }

        if (tile.extent.dimensions().x < 5) {
            return false;
        }

        if (!sse) {
            return true;
        }

        const values = [
            sse.lengths.x * sse.ratio,
            sse.lengths.y * sse.ratio,
        ];

        // TODO: depends on texture size of course
        // if (values.filter(v => v < 200).length >= 2) {
        //     return false;
        // }
        if (values.filter(v => v < (100 * tile.layer.sseScale)).length >= 1) {
            return false;
        }
        return values.filter(v => v >= (384 * tile.layer.sseScale)).length >= 2;
    }

    updateMinMaxDistance(context, node) {
        const bbox = node.OBB().box3D.clone()
            .applyMatrix4(node.OBB().matrixWorld);
        const distance = context.distance.plane
            .distanceToPoint(bbox.getCenter(tmpVector));
        const radius = bbox.getSize(tmpVector).length() * 0.5;
        this._distance.min = Math.min(this._distance.min, distance - radius);
        this._distance.max = Math.max(this._distance.max, distance + radius);
    }
}

export default Map;
