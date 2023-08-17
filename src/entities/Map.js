/**
 * @module entities/Map
 */
import {
    Vector2,
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
import ObjectRemovalHelper from '../utils/ObjectRemovalHelper.js';
import Picking from '../core/Picking.js';
import ScreenSpaceError from '../core/ScreenSpaceError.js';
import LayeredMaterial, { DEFAULT_AZIMUTH, DEFAULT_ZENITH } from '../renderer/LayeredMaterial.js';
import TileMesh from '../core/TileMesh.js';
import TileIndex from '../core/TileIndex.js';
import RenderingState from '../renderer/RenderingState.js';
import ColorMapAtlas from '../renderer/ColorMapAtlas.js';
import AtlasBuilder from '../renderer/AtlasBuilder.js';
import Capabilities from '../core/system/Capabilities.js';

const DEFAULT_BACKGROUND_COLOR = new Color(0.04, 0.23, 0.35);

/**
 * @typedef {Function} LayerCompareFn
 * @param {Layer} a - The first layer.
 * @param {Layer} b - The second layer.
 * @returns {number} The comparison result.
 */

/**
 * The maximum supported aspect ratio for the map tiles, before we stop trying to create square
 * tiles. This is a safety measure to avoid huge number of root tiles when the extent is a very
 * elongated rectangle. If the map extent has a greater ratio than this value, the generated tiles
 * will not be square-ish anymore.
 */
const MAX_SUPPORTED_ASPECT_RATIO = 10;

/**
 * Fires when the layers are reordered.
 *
 * @api
 * @event Map#layer-order-changed
 * @example
 * map.addEventListener('layer-order-changed', () => console.log('order changed!'));
 */

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

/**
 * @param {boolean|undefined|HillshadingOptions} input The input
 * @returns {HillshadingOptions} The options.
 */
function getHillshadingOptions(input) {
    if (!input) {
        // Default values
        return {
            enabled: false,
            elevationLayersOnly: false,
            azimuth: DEFAULT_AZIMUTH,
            zenith: DEFAULT_ZENITH,
        };
    }

    if (typeof input === 'boolean') {
        // Default values
        return {
            enabled: true,
            elevationLayersOnly: false,
            azimuth: DEFAULT_AZIMUTH,
            zenith: DEFAULT_ZENITH,
        };
    }

    return {
        enabled: input.enabled ?? false,
        elevationLayersOnly: input.elevationLayersOnly ?? false,
        azimuth: input.azimuth ?? DEFAULT_AZIMUTH,
        zenith: input.zenith ?? DEFAULT_ZENITH,
    };
}

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

function selectBestSubdivisions(extent) {
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
        return new Vector2(baseSize, baseSize);
    }

    if (ratio > 1) {
        const actualRatio = Math.min(ratio, MAX_SUPPORTED_ASPECT_RATIO);
        // We have an horizontal tile
        return new Vector2(Math.round(baseSize * actualRatio), baseSize);
    }

    const actualRatio = Math.min(1 / ratio, MAX_SUPPORTED_ASPECT_RATIO);

    // We have a vertical tile
    return new Vector2(baseSize, Math.round(baseSize * actualRatio));
}

/**
 * @api
 * @typedef {object} HillshadingOptions
 * @property {boolean} [enabled=true] Enables hillshading.
 * @property {number} [azimuth=135] The azimuth of the sun, in degrees.
 * @property {number} [zenith=45] The vertical angle of the sun, in degrees. (90 = zenith)
 * @property {boolean} [elevationLayersOnly=false] If `true`, only elevation layers are shaded,
 * leaving the color layers unshaded.
 */

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
     * @param {boolean|HillshadingOptions} [options.hillshading=undefined] Enables [hillshading](https://earthquake.usgs.gov/education/geologicmaps/hillshades.php).
     * If `undefined` or `false`, hillshading is disabled.
     *
     * Note: hillshading has no effect if the map does not contain an elevation layer.
     * @param {number} [options.segments=8] The number of geometry segments in each map tile.
     * The higher the better. It *must* be power of two between `1` included and `256` included.
     * Note: the number of vertices per tile side is `segments` + 1.
     * @param {boolean} [options.doubleSided=false] If `true`, both sides of the map will be
     * rendered, i.e when looking at the map from underneath.
     * @param {boolean} [options.discardNoData=false] If `true`, parts of the map that relate to
     * no-data elevation values are not displayed. Note: you should only set this value to `true` if
     * an elevation layer is present, otherwise the map will never be displayed.
     * @param {module:three.Object3D} [options.object3d=undefined] The optional 3d object to use as
     * the root object of this map. If none provided, a new one will be created.
     * @param {string} [options.backgroundColor=undefined] The color of the map when no color layers
     * are present.
     * @param {number} [options.backgroundOpacity=1] The opacity of the map background.
     * Defaults is opaque (1).
     * @param {boolean} [options.showOutline=false] Show the map tiles' borders.
     * @param {object} [options.elevationRange=undefined] The optional elevation range of
     * the map. The map will not be rendered for elevations outside of this range.
     * Note: this feature is only useful if an elevation layer is added to this map.
     * @param {number} options.elevationRange.min The min value.
     * @param {number} options.elevationRange.max The max value.
     * @api
     */
    constructor(id, options) {
        super(id, options.object3d || new Group());

        /** @type {Array<TileMesh>} */
        this.level0Nodes = [];

        this.geometryPool = new window.Map();

        this._layerIndices = new window.Map();

        this.atlasInfo = { maxX: 0, maxY: 0 };

        /** @type {Extent} */
        if (!options.extent.isValid()) {
            throw new Error('Invalid extent: minX must be less than maxX and minY must be less than maxY.');
        }
        this.extent = options.extent;

        this.subdivisions = selectBestSubdivisions(this.extent);

        this.sseScale = 1.5;
        this.maxSubdivisionLevel = options.maxSubdivisionLevel || 30;

        /**
         * Read-only flag to check if a given object is of type Map.
         *
         * @type {boolean}
         * @api
         */
        this.isMap = true;
        this.type = 'Map';
        this.visible = true;

        /** @type {boolean} */
        this.showOutline = options.showOutline;

        this._renderOrder = 0;

        this._segments = options.segments || 8;

        /**
         * @type {import('../renderer/LayeredMaterial.js').MaterialOptions}
         */
        this.materialOptions = {
            hillshading: getHillshadingOptions(options.hillshading),
            discardNoData: options.discardNoData || false,
            doubleSided: options.doubleSided || false,
            segments: this.segments,
            elevationRange: options.elevationRange,
            backgroundOpacity: options.backgroundOpacity == null ? 1 : options.backgroundOpacity,
            backgroundColor: options.backgroundColor !== undefined
                ? new Color(options.backgroundColor)
                : DEFAULT_BACKGROUND_COLOR.clone(),
        };

        this.currentAddedLayerIds = [];
        this.tileIndex = new TileIndex();
    }

    /**
     * Returns `true` if this map is currently processing data.
     *
     * @api
     * @type {boolean}
     */
    get loading() {
        return this._attachedLayers.some(l => l.loading);
    }

    /**
     * Gets the loading progress (between 0 and 1) of the map. This is the average progress of all
     * layers in this map.
     * Note: if no layer is present, this will always be 1.
     * Note: This value is only meaningful is {@link loading} is `true`.
     *
     * @api
     * @type {number}
     */
    get progress() {
        if (this._attachedLayers.length === 0) {
            return 1;
        }

        const sum = this._attachedLayers.reduce((accum, layer) => accum + layer.progress, 0);
        return sum / this._attachedLayers.length;
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

    /**
     * Gets or sets the render order of the tiles of this map.
     *
     * @api
     * @type {number}
     */
    get renderOrder() {
        return this._renderOrder;
    }

    set renderOrder(v) {
        if (v !== this._renderOrder) {
            this._renderOrder = v;

            this._forEachTile(tile => { tile.renderOrder = v; });
        }
    }

    _clearGeometryPool() {
        this.geometryPool.forEach(v => v.dispose());
        this.geometryPool.clear();
    }

    _updateGeometries() {
        this._forEachTile(tile => { tile.segments = this.segments; });
    }

    preprocess() {
        this.onTileCreated = this.onTileCreated || (() => {});

        // If the map is not square, we want to have more than a single
        // root tile to avoid elongated tiles that hurt visual quality and SSE computation.
        const rootExtents = this.extent.split(this.subdivisions.x, this.subdivisions.y);

        this.imageSize = computeImageSize(rootExtents[0]);

        let i = 0;
        for (const root of rootExtents) {
            if (this.subdivisions.x > this.subdivisions.y) {
                this.level0Nodes.push(
                    this.requestNewTile(root, undefined, 0, i, 0),
                );
            } else if (this.subdivisions.y > this.subdivisions.x) {
                this.level0Nodes.push(
                    this.requestNewTile(root, undefined, 0, 0, i),
                );
            } else {
                this.level0Nodes.push(
                    this.requestNewTile(root, undefined, 0, 0, 0),
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

    requestNewTile(extent, parent, level, x = 0, y = 0) {
        if (parent && !parent.material) {
            return null;
        }

        const quaternion = new Quaternion();
        const position = new Vector3(...extent.center()._values);

        // build tile
        const material = new LayeredMaterial({
            renderer: this._instance.renderer,
            atlasInfo: this.atlasInfo,
            options: this.materialOptions,
            getIndexFn: this.getIndex.bind(this),
        });

        const tile = new TileMesh({
            map: this,
            material,
            extent,
            textureSize: this.imageSize,
            segments: this.segments,
            coord: { level, x, y },
        });

        tile.renderOrder = this.renderOrder;
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

    /**
     * Sort the color layers according to the comparator function.
     *
     * @api
     * @param {LayerCompareFn} compareFn The comparator function.
     */
    sortColorLayers(compareFn) {
        if (compareFn == null) {
            throw new Error('missing comparator function');
        }

        this._attachedLayers.sort((a, b) => {
            if (a instanceof ColorLayer && b instanceof ColorLayer) {
                return compareFn(a, b);
            }

            // Sorting elevation layers has no effect currently, so by convention
            // we push them to the start of the list.
            if (a instanceof ElevationLayer && b instanceof ElevationLayer) {
                return 0;
            }

            if (a instanceof ElevationLayer) {
                return -1;
            }

            return 1;
        });
        this._reorderLayers();
    }

    /**
     * Moves the layer closer to the foreground.
     *
     * Note: this only applies to color layers.
     *
     * @api
     * @param {ColorLayer} layer The layer to move.
     * @throws {Error} If the layer is not present in the map.
     * @example
     * map.addLayer(foo);
     * map.addLayer(bar);
     * map.addLayer(baz);
     * // Layers (back to front) : foo, bar, baz
     *
     * map.moveLayerUp(foo);
     * // Layers (back to front) : bar, foo, baz
     */
    moveLayerUp(layer) {
        const position = this._attachedLayers.indexOf(layer);

        if (position === -1) {
            throw new Error('The layer is not present in the map.');
        }

        if (position < this._attachedLayers.length - 1) {
            const next = this._attachedLayers[position + 1];
            this._attachedLayers[position + 1] = layer;
            this._attachedLayers[position] = next;

            this._reorderLayers();
        }
    }

    /**
     * Moves the specified layer after the other layer in the list.
     *
     * @api
     * @param {ColorLayer} layer The layer to move.
     * @param {ColorLayer} target The target layer. If `null`, then the layer is put at the
     * beginning of the layer list.
     * @throws {Error} If the layer is not present in the map.
     * @example
     * map.addLayer(foo);
     * map.addLayer(bar);
     * map.addLayer(baz);
     * // Layers (back to front) : foo, bar, baz
     *
     * map.insertLayerAfter(foo, baz);
     * // Layers (back to front) : bar, baz, foo
     */
    insertLayerAfter(layer, target) {
        const position = this._attachedLayers.indexOf(layer);
        let afterPosition = this._attachedLayers.indexOf(target);

        if (position === -1) {
            throw new Error('The layer is not present in the map.');
        }

        if (afterPosition === -1) {
            afterPosition = 0;
        }

        this._attachedLayers.splice(position, 1);
        afterPosition = this._attachedLayers.indexOf(target);
        this._attachedLayers.splice(afterPosition + 1, 0, layer);

        this._reorderLayers();
    }

    /**
     * Moves the layer closer to the background.
     *
     * Note: this only applies to color layers.
     *
     * @api
     * @param {ColorLayer} layer The layer to move.
     * @throws {Error} If the layer is not present in the map.
     * @example
     * map.addLayer(foo);
     * map.addLayer(bar);
     * map.addLayer(baz);
     * // Layers (back to front) : foo, bar, baz
     *
     * map.moveLayerDown(baz);
     * // Layers (back to front) : foo, baz, bar
     */
    moveLayerDown(layer) {
        const position = this._attachedLayers.indexOf(layer);

        if (position === -1) {
            throw new Error('The layer is not present in the map.');
        }

        if (position > 0) {
            const prev = this._attachedLayers[position - 1];
            this._attachedLayers[position - 1] = layer;
            this._attachedLayers[position] = prev;

            this._reorderLayers();
        }
    }

    /**
     * Returns the position of the layer in the layer list.
     *
     * @api
     * @param {Layer} layer The layer to search.
     * @returns {number} The index of the layer.
     */
    getIndex(layer) {
        return this._layerIndices.get(layer.id);
    }

    _reorderLayers() {
        const layers = this._attachedLayers;

        for (let i = 0; i < layers.length; i++) {
            const element = layers[i];
            this._layerIndices.set(element.id, i);
        }

        this._forEachTile(tile => tile.reorderLayers());

        this.dispatchEvent({ type: 'layer-order-changed' });

        this._instance.notifyChange(this, true);
    }

    contains(obj) {
        if (obj instanceof Layer) {
            return this._attachedLayers.includes(obj);
        }

        return false;
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

                if (this.testTileSSE(node, sse) && this.canSubdivide(node)) {
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
        super.postUpdate();

        this._forEachTile(tile => {
            if (tile.material.visible) {
                const neighbours = this.tileIndex.getNeighbours(tile);
                tile.processNeighbours(neighbours);
            }
        });
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

            layer.instance = this._instance;

            this.attach(layer);

            if (layer instanceof ColorLayer) {
                const colorLayers = this._attachedLayers.filter(l => l instanceof ColorLayer);

                // rebuild color textures atlas
                // We use a margin to prevent atlas bleeding.
                const margin = 1.1;
                const { x, y } = this.imageSize;
                const size = new Vector2(Math.round(x * margin), Math.round(y * margin));

                const { atlas, maxX, maxY } = AtlasBuilder.pack(
                    Capabilities.getMaxTextureSize(),
                    colorLayers.map(l => ({ id: l.id, size })),
                    this.atlasInfo.atlas,
                );
                this.atlasInfo.atlas = atlas;
                this.atlasInfo.maxX = Math.max(this.atlasInfo.maxX, maxX);
                this.atlasInfo.maxY = Math.max(this.atlasInfo.maxY, maxY);
            }

            if (layer.colorMap) {
                if (!this.materialOptions.colorMapAtlas) {
                    this.materialOptions.colorMapAtlas = new ColorMapAtlas(this._instance.renderer);
                    this._forEachTile(t => {
                        t.material.setColorMapAtlas(this.materialOptions.colorMapAtlas);
                    });
                }
                this.materialOptions.colorMapAtlas.add(layer.colorMap);
            }

            layer.whenReady.then(l => {
                if (!this.currentAddedLayerIds.includes(layer.id)) {
                    // The layer was removed, stop attaching it.
                    return;
                }

                this._reorderLayers();
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
     * @param {object} [options] The options.
     * @param {boolean} [options.disposeLayer=false] If `true`, the layer is also disposed.
     * @returns {boolean} `true` if the layer was present, `false` otherwise.
     * @api
     */
    removeLayer(layer, options = {}) {
        this.currentAddedLayerIds = this.currentAddedLayerIds.filter(l => l !== layer.id);
        if (this.detach(layer)) {
            if (layer.colorMap) {
                this.materialOptions.colorMapAtlas.remove(layer.colorMap);
            }
            this._forEachTile(tile => {
                layer.unregisterNode(tile);
            });
            layer.postUpdate();
            this._reorderLayers();
            this.dispatchEvent({ type: 'layer-removed' });
            this._instance.notifyChange(this, true);
            if (options.disposeLayer) {
                layer.dispose();
            }
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
     * Disposes this map and associated unmanaged resources.
     *
     * Note: By default, layers in this map are not automatically disposed, except when
     * `disposeLayers` is `true`.
     *
     * @param {object} [options] Options.
     * @param {boolean} [options.disposeLayers=false] If true, layers are also disposed.
     */
    dispose(options = {}) {
        // Delete cached TileGeometry objects. This is not possible to do
        // at the TileMesh level because TileMesh objects do not own their geometry,
        // as it is shared among all tiles at the same depth level.
        this._clearGeometryPool();

        // Dispose all tiles so that every layer will unload data relevant to those tiles.
        this._forEachTile(t => t.dispose());

        if (options.disposeLayers) {
            this.getLayers().forEach(layer => layer.dispose());
        }

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
            let min = null;
            let max = null;

            for (const layer of elevationLayers) {
                const minmax = layer.minmax;
                if (minmax) {
                    if (min == null && max == null) {
                        min = minmax.min;
                        max = minmax.max;
                    } else {
                        min = Math.min(min, minmax.min);
                        max = Math.max(max, minmax.max);
                    }
                }
            }

            if (min != null && max != null) {
                return { min, max };
            }
        }
        return { min: 0, max: 0 };
    }

    /**
     * Applies the function to all tiles of this map.
     *
     * @param {Function} fn The function to apply to each tile.
     */
    _forEachTile(fn) {
        for (const r of this.level0Nodes) {
            r.traverse(obj => {
                if (obj.isTileMesh) {
                    fn(obj);
                }
            });
        }
    }

    /**
     * @param {TileMesh} node The
     * @returns {boolean} True if the node can be subdivided.
     */
    canSubdivide(node) {
        // Prevent subdivision if node is covered by at least one elevation layer
        // and if node doesn't have a elevation texture yet.
        for (const e of this.getElevationLayers()) {
            if (!e.frozen && e.ready && e.contains(node.getExtent())
                && !node.canSubdivide()) {
                return false;
            }
        }

        if (node.children.some(n => n.layer === this)) {
            // No need to prevent subdivision, since we've already done it before
            return true;
        }

        return true;
    }

    testTileSSE(tile, sse) {
        if (this.maxSubdivisionLevel > 0 && this.maxSubdivisionLevel <= tile.level) {
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
