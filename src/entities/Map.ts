import {
    Vector2,
    Vector3,
    Quaternion,
    Group,
    Color,
    MathUtils,
    type Camera as ThreeCamera,
    type Object3D,
    type TextureDataType,
    UnsignedByteType,
} from 'three';

import type Extent from '../core/geographic/Extent';
import Layer from '../core/layer/Layer';
import ColorLayer from '../core/layer/ColorLayer';
import ElevationLayer from '../core/layer/ElevationLayer';
import Entity3D, { type Entity3DEventMap } from './Entity3D';
import type { SSE } from '../core/ScreenSpaceError';
import ScreenSpaceError from '../core/ScreenSpaceError';
import LayeredMaterial, {
    DEFAULT_AZIMUTH,
    DEFAULT_HILLSHADING_INTENSITY,
    DEFAULT_ZENITH,
} from '../renderer/LayeredMaterial';
import TileMesh, { isTileMesh } from '../core/TileMesh';
import TileIndex from '../core/TileIndex';
import type RenderingState from '../renderer/RenderingState';
import ColorMapAtlas from '../renderer/ColorMapAtlas';
import AtlasBuilder, { type AtlasInfo } from '../renderer/AtlasBuilder';
import Capabilities from '../core/system/Capabilities';
import type { Context, ContourLineOptions, ElevationRange } from '../core';
import type TileGeometry from '../core/TileGeometry';
import { type MaterialOptions } from '../renderer/LayeredMaterial';
import type HillshadingOptions from '../core/HillshadingOptions';
import type TerrainOptions from '../core/TerrainOptions';
import type ColorimetryOptions from '../core/ColorimetryOptions';
import type Pickable from '../core/picking/Pickable';
import type PickOptions from '../core/picking/PickOptions';
import pickTilesAt, { type MapPickResult } from '../core/picking/PickTilesAt';
import type PickableFeatures from '../core/picking/PickableFeatures';
import { isPickableFeatures } from '../core/picking/PickableFeatures';
import type { ColorMap } from '../core/layer';
import type HasLayers from '../core/layer/HasLayers';
import { defaultColorimetryOptions } from '../core/ColorimetryOptions';
import TextureGenerator from '../utils/TextureGenerator';
import type { EntityUserData } from './Entity';

const DEFAULT_BACKGROUND_COLOR = new Color().setRGB(0.04, 0.23, 0.35, 'srgb');

/**
 * Comparison function to order layers.
 */
export type LayerCompareFn = (a: Layer, b: Layer) => number;

/**
 * The maximum supported aspect ratio for the map tiles, before we stop trying to create square
 * tiles. This is a safety measure to avoid huge number of root tiles when the extent is a very
 * elongated rectangle. If the map extent has a greater ratio than this value, the generated tiles
 * will not be square-ish anymore.
 */
const MAX_SUPPORTED_ASPECT_RATIO = 10;

const tmpVector = new Vector3();

function getContourLineOptions(input: boolean | undefined | ContourLineOptions)
    : ContourLineOptions {
    if (!input) {
        // Default values
        return {
            enabled: false,
            thickness: 1,
            interval: 100,
            secondaryInterval: 20,
            color: new Color(0, 0, 0),
            opacity: 1,
        };
    }

    if (typeof input === 'boolean') {
        // Default values
        return {
            enabled: true,
            thickness: 1,
            interval: 100,
            secondaryInterval: 20,
            color: new Color(0, 0, 0),
            opacity: 1,
        };
    }

    return {
        enabled: input.enabled ?? false,
        thickness: input.thickness ?? 1,
        interval: input.interval ?? 100,
        secondaryInterval: input.secondaryInterval ?? 20,
        color: input.color ?? new Color(0, 0, 0),
        opacity: input.opacity ?? 1,
    };
}

function getTerrainOptions(input?: boolean | TerrainOptions): TerrainOptions {
    if (input == null) {
        // Default values
        return {
            enabled: true,
            stitching: true,
        };
    }

    if (typeof input === 'boolean') {
        return {
            enabled: input,
            stitching: true,
        };
    }

    return {
        enabled: input.enabled ?? true,
        stitching: input.stitching ?? true,
    };
}

function getColorimetryOptions(input?: ColorimetryOptions)
    : ColorimetryOptions {
    return input ?? defaultColorimetryOptions();
}

function getHillshadingOptions(input?: boolean | HillshadingOptions)
    : HillshadingOptions {
    if (!input) {
        // Default values
        return {
            enabled: false,
            elevationLayersOnly: false,
            intensity: DEFAULT_HILLSHADING_INTENSITY,
            azimuth: DEFAULT_AZIMUTH,
            zenith: DEFAULT_ZENITH,
        };
    }

    if (typeof input === 'boolean') {
        // Default values
        return {
            enabled: true,
            elevationLayersOnly: false,
            intensity: DEFAULT_HILLSHADING_INTENSITY,
            azimuth: DEFAULT_AZIMUTH,
            zenith: DEFAULT_ZENITH,
        };
    }

    return {
        enabled: input.enabled ?? false,
        elevationLayersOnly: input.elevationLayersOnly ?? false,
        azimuth: input.azimuth ?? DEFAULT_AZIMUTH,
        zenith: input.zenith ?? DEFAULT_ZENITH,
        intensity: input.intensity ?? DEFAULT_HILLSHADING_INTENSITY,
    };
}

function selectBestSubdivisions(extent: Extent) {
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
 * @param extent - The map extent.
 */
function computeImageSize(extent: Extent) {
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

function getWidestDataType(layers: Layer[]): TextureDataType {
    // Select the type that can contain all the layers (i.e the widest data type.)
    let currentSize = -1;
    let result: TextureDataType = UnsignedByteType;

    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];

        const type = layer.getRenderTargetDataType();
        const size = TextureGenerator.getBytesPerChannel(type);

        if (size > currentSize) {
            currentSize = size;
            result = type;
        }
    }

    return result;
}

export interface MapEventMap extends Entity3DEventMap {
    /** Fires when a the layer ordering changes. */
    'layer-order-changed': {};
    /** Fires when a layer is added to the map. */
    'layer-added': { layer: Layer; };
    /** Fires when a layer is removed from the map. */
    'layer-removed': { layer: Layer; };
}

/**
 * A map is an {@link entities.Entity | Entity} that represents a flat
 * surface displaying one or more {@link core.layer.Layer | Layers}.
 *
 * If an elevation layer is added, the surface of the map is deformed to
 * display terrain.
 */
class Map<UserData = EntityUserData>
    extends Entity3D<MapEventMap, UserData>
    implements Pickable<MapPickResult>, PickableFeatures<any, MapPickResult>, HasLayers {
    readonly hasLayers = true;
    private _segments: number;
    private readonly _atlasInfo: AtlasInfo;
    private _subdivisions: { x: number; y: number; };
    private _colorAtlasDataType: TextureDataType = UnsignedByteType;
    private _imageSize: Vector2;
    private readonly _layers: Layer[] = [];
    /** @internal */
    readonly level0Nodes: TileMesh[];
    private readonly _layerIndices: globalThis.Map<string, number>;
    private readonly _layerIds: Set<string> = new Set();
    readonly geometryPool: globalThis.Map<string, TileGeometry>;
    extent: Extent;
    readonly maxSubdivisionLevel: number;
    /**
     * Read-only flag to check if a given object is of type Map.
     */
    readonly isMap: boolean = true;
    readonly isPickableFeatures = true;
    readonly materialOptions: MaterialOptions;
    readonly showOutline: boolean;
    /** @internal */
    readonly tileIndex: TileIndex;
    /** @internal */
    sseScale: number;

    /**
     * Displays the map tiles in wireframe.
     */
    wireframe: boolean;

    onTileCreated: (map: Map, parent: TileMesh, tile: TileMesh) => void;

    /**
     * Constructs a Map object.
     *
     * @param id - The unique identifier of the map.
     * @param options - Constructor options.
     * @param options -.extent The geographic extent of the map.
     * @param options -.maxSubdivisionLevel Maximum tile depth of the map.
     * A value of `-1` does not limit the depth of the tile hierarchy.
     * @param options -.hillshading Enables [hillshading](https://earthquake.usgs.gov/education/geologicmaps/hillshades.php).
     * If `undefined` or `false`, hillshading is disabled.
     *
     * Note: hillshading has no effect if the map does not contain an elevation layer.
     * @param options -.contourLines Enables contour lines. If `undefined` or `false`, contour lines
     * are not displayed.
     *
     * Note: this option has no effect if the map does not contain an elevation layer.
     * @param options -.segments The number of geometry segments in each map tile.
     * The higher the better. It *must* be power of two between `1` included and `256` included.
     * Note: the number of vertices per tile side is `segments` + 1.
     * @param options -.doubleSided If `true`, both sides of the map will be rendered, i.e when
     * looking at the map from underneath.
     * @param options -.discardNoData If `true`, parts of the map that relate to no-data elevation
     * values are not displayed. Note: you should only set this value to `true` if
     * an elevation layer is present, otherwise the map will never be displayed.
     * @param options -.object3d The optional 3d object to use as the root object of this map.
     * If none provided, a new one will be created.
     * @param options -.backgroundColor The color of the map when no color layers are present.
     * @param options -.backgroundOpacity The opacity of the map background.
     * Defaults is opaque (1).
     * @param options -.showOutline Show the map tiles' borders.
     * @param options -.elevationRange The optional elevation range of the map. The map will not be
     * rendered for elevations outside of this range.
     * Note: this feature is only useful if an elevation layer is added to this map.
     * @param options -.terrain Options for geometric terrain rendering.
     * @param options -.colorimetry The colorimetry for the whole map.
     * Those are distinct from the individual layers' own colorimetry.
     */
    constructor(id: string, options: {
        extent: Extent;
        maxSubdivisionLevel?: number;
        hillshading?: boolean | HillshadingOptions;
        contourLines?: boolean | ContourLineOptions;
        colorimetry?: ColorimetryOptions;
        segments?: number;
        doubleSided?: boolean;
        terrain?: boolean | TerrainOptions;
        discardNoData?: boolean;
        object3d?: Object3D;
        backgroundColor?: string;
        backgroundOpacity?: number;
        showOutline?: boolean;
        elevationRange?: ElevationRange;
    }) {
        super(id, options.object3d || new Group());

        this.level0Nodes = [];

        this.geometryPool = new window.Map();

        this._layerIndices = new window.Map();

        this._atlasInfo = { maxX: 0, maxY: 0, atlas: null };

        if (!options.extent.isValid()) {
            throw new Error('Invalid extent: minX must be less than maxX and minY must be less than maxY.');
        }
        this.extent = options.extent;

        this.sseScale = 1.5;
        this.maxSubdivisionLevel = options.maxSubdivisionLevel ?? 30;

        this.type = 'Map';

        this.showOutline = options.showOutline;

        this._segments = options.segments || 8;

        this.materialOptions = {
            hillshading: getHillshadingOptions(options.hillshading),
            contourLines: getContourLineOptions(options.contourLines),
            discardNoData: options.discardNoData || false,
            doubleSided: options.doubleSided || false,
            terrain: getTerrainOptions(options.terrain),
            colorimetry: getColorimetryOptions(options.colorimetry),
            segments: this.segments,
            elevationRange: options.elevationRange,
            backgroundOpacity: options.backgroundOpacity == null ? 1 : options.backgroundOpacity,
            backgroundColor: options.backgroundColor !== undefined
                ? new Color(options.backgroundColor)
                : DEFAULT_BACKGROUND_COLOR.clone(),
        };

        this.tileIndex = new TileIndex();
    }

    /**
     * Returns `true` if this map is currently processing data.
     */
    get loading() {
        return this._layers.some(l => l.loading);
    }

    /**
     * Gets the loading progress (between 0 and 1) of the map. This is the average progress of all
     * layers in this map.
     * Note: if no layer is present, this will always be 1.
     * Note: This value is only meaningful is {@link loading} is `true`.
     */
    get progress() {
        if (this._layers.length === 0) {
            return 1;
        }

        const sum = this._layers.reduce((accum, layer) => accum + layer.progress, 0);
        return sum / this._layers.length;
    }

    get segments() {
        return this._segments;
    }

    set segments(v) {
        if (this._segments !== v) {
            if (MathUtils.isPowerOfTwo(v) && v >= 1 && v <= 128) {
                // Delete cached geometries that just became obsolete
                this.clearGeometryPool();
                this._segments = v;
                this._updateGeometries();
            } else {
                throw new Error('invalid segments. Must be a power of two between 1 and 128 included');
            }
        }
    }

    get imageSize(): Vector2 {
        return this._imageSize;
    }

    private subdivideNode(context: Context, node: TileMesh) {
        if (!node.children.some(n => isTileMesh(n))) {
            const extents = node.extent.split(2, 2);

            let i = 0;
            const { x, y, z } = node;
            for (const extent of extents) {
                let child;
                if (i === 0) {
                    child = this.requestNewTile(
                        extent, node, z + 1, 2 * x + 0, 2 * y + 0,
                    );
                } else if (i === 1) {
                    child = this.requestNewTile(
                        extent, node, z + 1, 2 * x + 0, 2 * y + 1,
                    );
                } else if (i === 2) {
                    child = this.requestNewTile(
                        extent, node, z + 1, 2 * x + 1, 2 * y + 0,
                    );
                } else if (i === 3) {
                    child = this.requestNewTile(
                        extent, node, z + 1, 2 * x + 1, 2 * y + 1,
                    );
                }
                node.add(child);

                // inherit our parent's textures
                for (const e of this.getElevationLayers()) {
                    e.update(context, child);
                }
                if (node.material.pixelWidth > 0) {
                    for (const c of this.getColorLayers()) {
                        c.update(context, child);
                    }
                }

                child.update(this.materialOptions);
                child.updateMatrixWorld(true);
                i++;
            }
            context.instance.notifyChange(node);
        }
    }

    private clearGeometryPool() {
        this.geometryPool.forEach(v => v.dispose());
        this.geometryPool.clear();
    }

    _updateGeometries() {
        this._forEachTile(tile => { tile.segments = this.segments; });
    }

    get subdivisions(): { x: number, y: number } {
        return this._subdivisions;
    }

    preprocess() {
        this.extent = this.extent.as(this._instance.referenceCrs);

        this._subdivisions = selectBestSubdivisions(this.extent);

        this.onTileCreated = this.onTileCreated || (() => {});

        // If the map is not square, we want to have more than a single
        // root tile to avoid elongated tiles that hurt visual quality and SSE computation.
        const rootExtents = this.extent.split(this._subdivisions.x, this._subdivisions.y);

        this._imageSize = computeImageSize(rootExtents[0]);

        let i = 0;
        for (const root of rootExtents) {
            if (this._subdivisions.x > this._subdivisions.y) {
                this.level0Nodes.push(
                    this.requestNewTile(root, undefined, 0, i, 0),
                );
            } else if (this._subdivisions.y > this._subdivisions.x) {
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
            level0.updateMatrixWorld(false);
        }

        return Promise.resolve();
    }

    private requestNewTile(extent: Extent, parent: TileMesh, level: number, x = 0, y = 0) {
        if (parent && !parent.material) {
            return null;
        }

        const quaternion = new Quaternion();
        const position = extent.centerAsVector3();

        // build tile
        const material = new LayeredMaterial({
            renderer: this._instance.renderer,
            atlasInfo: this._atlasInfo,
            options: this.materialOptions,
            getIndexFn: this.getIndex.bind(this),
            textureDataType: this._colorAtlasDataType,
        });

        const tile = new TileMesh({
            geometryPool: this.geometryPool,
            material,
            extent,
            textureSize: this._imageSize,
            segments: this.segments,
            coord: { level, x, y },
        });

        this.tileIndex.addTile(tile);

        tile.material.opacity = this.opacity;

        if (parent && parent instanceof TileMesh) {
            // get parent position from extent
            const positionParent = parent.extent.centerAsVector3();
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
            tile.setBBoxZ(parent.OBB.z.min, parent.OBB.z.max);
        } else {
            const { min, max } = this.getElevationMinMax();
            tile.setBBoxZ(min, max);
        }

        tile.add(tile.OBB);
        this.onTileCreated(this, parent, tile);

        this.onObjectCreated(tile);

        return tile;
    }

    /**
     * Sets the render state of the map.
     *
     * @param state - The new state.
     * @returns The function to revert to the previous state.
     */
    setRenderState(state: RenderingState) {
        const restores = this.level0Nodes.map(n => n.pushRenderState(state));

        return () => {
            restores.forEach(r => r());
        };
    }

    pick(coordinates: Vector2, options?: PickOptions): MapPickResult[] {
        return pickTilesAt(
            this._instance,
            coordinates,
            this,
            options,
        );
    }

    pickFeaturesFrom(pickedResult: MapPickResult, options?: PickOptions): any[] {
        const result: any[] = [];
        for (const layer of this._layers) {
            if (isPickableFeatures(layer)) {
                const res = layer.pickFeaturesFrom(pickedResult, options);
                result.push(...res);
            }
        }

        pickedResult.features = result;
        return result;
    }

    preUpdate(context: Context, changeSources: Set<unknown>) {
        this.materialOptions.colorMapAtlas?.update();

        this.tileIndex.update();

        if (changeSources.has(undefined) || changeSources.size === 0) {
            return this.level0Nodes;
        }

        let commonAncestor: TileMesh;
        for (const source of changeSources.values()) {
            if ((source as ThreeCamera).isCamera) {
                // if the change is caused by a camera move, no need to bother
                // to find common ancestor: we need to update the whole tree:
                // some invisible tiles may now be visible
                return this.level0Nodes;
            }
            if (isTileMesh(source)) {
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
            return [commonAncestor];
        }
        return this.level0Nodes;
    }

    /**
     * Sort the color layers according to the comparator function.
     *
     * @param compareFn - The comparator function.
     */
    sortColorLayers(compareFn: LayerCompareFn) {
        if (compareFn == null) {
            throw new Error('missing comparator function');
        }

        this._layers.sort((a, b) => {
            if ((a as ColorLayer).isColorLayer && (b as ColorLayer).isColorLayer) {
                return compareFn(a, b);
            }

            // Sorting elevation layers has no effect currently, so by convention
            // we push them to the start of the list.
            if ((a as ElevationLayer).isElevationLayer && (b as ElevationLayer).isElevationLayer) {
                return 0;
            }

            if ((a as ElevationLayer).isElevationLayer) {
                return -1;
            }

            return 1;
        });
        this.reorderLayers();
    }

    /**
     * Moves the layer closer to the foreground.
     *
     * Note: this only applies to color layers.
     *
     * @param layer - The layer to move.
     * @throws If the layer is not present in the map.
     * @example
     * map.addLayer(foo);
     * map.addLayer(bar);
     * map.addLayer(baz);
     * // Layers (back to front) : foo, bar, baz
     *
     * map.moveLayerUp(foo);
     * // Layers (back to front) : bar, foo, baz
     */
    moveLayerUp(layer: ColorLayer) {
        const position = this._layers.indexOf(layer);

        if (position === -1) {
            throw new Error('The layer is not present in the map.');
        }

        if (position < this._layers.length - 1) {
            const next = this._layers[position + 1];
            this._layers[position + 1] = layer;
            this._layers[position] = next;

            this.reorderLayers();
        }
    }

    /**
     * Moves the specified layer after the other layer in the list.
     *
     * @param layer - The layer to move.
     * @param target - The target layer. If `null`, then the layer is put at the
     * beginning of the layer list.
     * @throws If the layer is not present in the map.
     * @example
     * map.addLayer(foo);
     * map.addLayer(bar);
     * map.addLayer(baz);
     * // Layers (back to front) : foo, bar, baz
     *
     * map.insertLayerAfter(foo, baz);
     * // Layers (back to front) : bar, baz, foo
     */
    insertLayerAfter(layer: ColorLayer, target: ColorLayer) {
        const position = this._layers.indexOf(layer);
        let afterPosition = this._layers.indexOf(target);

        if (position === -1) {
            throw new Error('The layer is not present in the map.');
        }

        if (afterPosition === -1) {
            afterPosition = 0;
        }

        this._layers.splice(position, 1);
        afterPosition = this._layers.indexOf(target);
        this._layers.splice(afterPosition + 1, 0, layer);

        this.reorderLayers();
    }

    /**
     * Moves the layer closer to the background.
     *
     * Note: this only applies to color layers.
     *
     * @param layer - The layer to move.
     * @throws If the layer is not present in the map.
     * @example
     * map.addLayer(foo);
     * map.addLayer(bar);
     * map.addLayer(baz);
     * // Layers (back to front) : foo, bar, baz
     *
     * map.moveLayerDown(baz);
     * // Layers (back to front) : foo, baz, bar
     */
    moveLayerDown(layer: ColorLayer) {
        const position = this._layers.indexOf(layer);

        if (position === -1) {
            throw new Error('The layer is not present in the map.');
        }

        if (position > 0) {
            const prev = this._layers[position - 1];
            this._layers[position - 1] = layer;
            this._layers[position] = prev;

            this.reorderLayers();
        }
    }

    /**
     * Returns the position of the layer in the layer list.
     *
     * @param layer - The layer to search.
     * @returns The index of the layer.
     */
    getIndex(layer: Layer): number {
        return this._layerIndices.get(layer.id);
    }

    private reorderLayers() {
        const layers = this._layers;

        for (let i = 0; i < layers.length; i++) {
            const element = layers[i];
            this._layerIndices.set(element.id, i);
        }

        this._forEachTile(tile => tile.reorderLayers());

        this.dispatchEvent({ type: 'layer-order-changed' });

        this._instance.notifyChange(this, true);
    }

    contains(obj: unknown) {
        if ((obj as Layer).isLayer) {
            return this._layers.includes(obj as Layer);
        }

        return false;
    }

    update(context: Context, node: TileMesh): unknown[] | undefined {
        if (!node.parent) {
            node.dispose();
            return undefined;
        }

        if (context.fastUpdateHint) {
            if (!(context.fastUpdateHint as TileMesh).isAncestorOf(node)) {
                // if visible, children bbox can only be smaller => stop updates
                if (node.material.visible) {
                    this.updateMinMaxDistance(context, node);
                    return undefined;
                }
                if (node.visible) {
                    return node.children.filter(n => isTileMesh(n));
                }
                return undefined;
            }
        }

        // do proper culling
        if (!this.frozen) {
            node.update(this.materialOptions);

            const isVisible = context.camera.isBox3Visible(
                node.OBB.box3D, node.OBB.matrixWorld,
            );
            node.visible = isVisible;
        }

        if (node.visible) {
            let requestChildrenUpdate = false;

            if (!this.frozen) {
                const s = node.OBB.box3D.getSize(tmpVector);
                const obb = node.OBB;
                const sse = ScreenSpaceError.computeFromBox3(
                    context.camera,
                    obb.box3D,
                    obb.matrixWorld,
                    Math.max(s.x, s.y),
                    ScreenSpaceError.Mode.MODE_2D,
                );

                if (this.testTileSSE(node, sse) && this.canSubdivide(node)) {
                    this.subdivideNode(context, node);
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
                    return node.detachChildren();
                }
            }

            return requestChildrenUpdate
                ? node.children.filter(n => isTileMesh(n))
                : undefined;
        }

        node.setDisplayed(false);
        return node.detachChildren();
    }

    postUpdate() {
        this._layers.forEach(l => l.postUpdate());

        this._forEachTile(tile => {
            if (tile.material.visible) {
                const neighbours = this.tileIndex.getNeighbours(tile) as TileMesh[];
                tile.processNeighbours(neighbours);
            }
        });
    }

    private registerColorLayer(layer: ColorLayer) {
        const colorLayers = this._layers.filter(l => l instanceof ColorLayer);

        // rebuild color textures atlas
        // We use a margin to prevent atlas bleeding.
        const margin = 1.1;
        const factor = layer.resolutionFactor * margin;
        const { x, y } = this._imageSize;
        const size = new Vector2(Math.round(x * factor), Math.round(y * factor));

        const { atlas, maxX, maxY } = AtlasBuilder.pack(
            Capabilities.getMaxTextureSize(),
            colorLayers.map(l => ({ id: l.id, size })),
            this._atlasInfo.atlas,
        );
        this._atlasInfo.atlas = atlas;
        this._atlasInfo.maxX = Math.max(this._atlasInfo.maxX, maxX);
        this._atlasInfo.maxY = Math.max(this._atlasInfo.maxY, maxY);

        this._colorAtlasDataType = getWidestDataType(this.getColorLayers());
    }

    private updateGlobalMinMax() {
        const minmax = this.getElevationMinMax();
        this._forEachTile(tile => {
            tile.setBBoxZ(minmax.min, minmax.max);
        });
    }

    private registerColorMap(colorMap: ColorMap) {
        if (!this.materialOptions.colorMapAtlas) {
            this.materialOptions.colorMapAtlas = new ColorMapAtlas(this._instance.renderer);
            this._forEachTile(t => {
                t.material.setColorMapAtlas(this.materialOptions.colorMapAtlas);
            });
        }
        this.materialOptions.colorMapAtlas.add(colorMap);
    }

    /**
     * Adds a layer, then returns the created layer.
     * Before using this method, make sure that the map is added in an instance.
     * If the extent or the projection of the layer is not provided,
     * those values will be inherited from the map.
     *
     * @param layer - the layer to add
     * @returns a promise resolving when the layer is ready
     */
    async addLayer<TLayer extends Layer>(layer: TLayer): Promise<TLayer> {
        if (!this._instance) {
            throw new Error('map is not attached to an instance');
        }

        if (!(layer instanceof Layer)) {
            throw new Error('layer is not an instance of Layer');
        }

        if (this._layerIds.has(layer.id)) {
            throw new Error(`layer ${layer.name || layer.id} is already present in this map`);
        }

        this._layerIds.add(layer.id);

        this._layers.push(layer);

        await layer.initialize({ instance: this._instance });

        if (layer instanceof ColorLayer) {
            this.registerColorLayer(layer);
        } else if (layer instanceof ElevationLayer) {
            this.updateGlobalMinMax();
        }

        if (layer.colorMap) {
            this.registerColorMap(layer.colorMap);
        }

        this.reorderLayers();

        this._instance.notifyChange(this, false);

        this.dispatchEvent({ type: 'layer-added', layer });

        return layer;
    }

    /**
     * Removes a layer from the map.
     *
     * @param layer - the layer to remove
     * @param options - The options.
     * @returns `true` if the layer was present, `false` otherwise.
     */
    removeLayer(layer: Layer, options: {
        /** If `true`, the layer is also disposed. */
        disposeLayer?: boolean;
    } = {}): boolean {
        if (!layer) {
            return false;
        }

        if (this._layerIds.has(layer.id)) {
            this._layerIds.delete(layer.id);
            this._layers.splice(this._layers.indexOf(layer));
            if (layer.colorMap) {
                this.materialOptions.colorMapAtlas.remove(layer.colorMap);
            }
            this._forEachTile(tile => {
                layer.unregisterNode(tile);
            });
            layer.postUpdate();
            this.reorderLayers();
            this.dispatchEvent({ type: 'layer-removed', layer });
            this._instance.notifyChange(this, true);
            if (options.disposeLayer) {
                layer.dispose();
            }
            return true;
        }

        return false;
    }

    get layerCount() {
        return this._layers.length;
    }

    forEachLayer(callback: (layer: Layer) => void): void {
        this._layers.forEach(l => callback(l));
    }

    /**
     * Gets all layers that satisfy the filter predicate.
     *
     * @param predicate - the optional predicate.
     * @returns the layers that matched the predicate or all layers if no predicate was provided.
     */
    getLayers(predicate?: (arg0: Layer) => boolean) {
        const result = [];
        for (const layer of this._layers) {
            if (!predicate || predicate(layer)) {
                result.push(layer);
            }
        }
        return result;
    }

    /**
     * Gets all color layers in this map.
     *
     * @returns the color layers
     */
    getColorLayers(): ColorLayer[] {
        return this.getLayers(l => (l as ColorLayer).isColorLayer) as ColorLayer[];
    }

    /**
     * Gets all elevation layers in this map.
     *
     * @returns the elevation layers
     */
    getElevationLayers(): ElevationLayer[] {
        return this.getLayers(l => (l as ElevationLayer).isElevationLayer) as ElevationLayer[];
    }

    /**
     * Disposes this map and associated unmanaged resources.
     *
     * Note: By default, layers in this map are not automatically disposed, except when
     * `disposeLayers` is `true`.
     *
     * @param options - Options.
     * @param options -.disposeLayers If true, layers are also disposed.
     */
    dispose(options: {
        disposeLayers?: boolean;
    } = {
        disposeLayers: false,
    }) {
        // Delete cached TileGeometry objects. This is not possible to do
        // at the TileMesh level because TileMesh objects do not own their geometry,
        // as it is shared among all tiles at the same depth level.
        this.clearGeometryPool();

        // Dispose all tiles so that every layer will unload data relevant to those tiles.
        this._forEachTile(t => t.dispose());

        if (options.disposeLayers) {
            this.getLayers().forEach(layer => layer.dispose());
        }

        this.materialOptions.colorMapAtlas?.dispose();
    }

    /**
     * Returns the minimal and maximal elevation values in this map, in meters.
     *
     * If there is no elevation layer present, returns `{ min: 0, max: 0 }`.
     *
     * @returns The min/max value.
     */
    getElevationMinMax(): ElevationRange {
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
     * @param fn - The function to apply to each tile.
     */
    _forEachTile(fn: (tile: TileMesh) => void) {
        for (const r of this.level0Nodes) {
            r.traverse(obj => {
                if ((obj as TileMesh).isTileMesh) {
                    fn(obj as TileMesh);
                }
            });
        }
    }

    /**
     * @param node - The node to subdivide.
     * @returns True if the node can be subdivided.
     */
    canSubdivide(node: TileMesh): boolean {
        // No problem subdividing if terrain deformation is disabled,
        // since bounding boxes are always up to date (as they don't have an elevation component).
        if (!this.materialOptions.terrain.enabled) {
            return true;
        }

        // Prevent subdivision if node is covered by at least one elevation layer
        // and if node doesn't have a elevation texture yet.
        for (const e of this.getElevationLayers()) {
            if (e.visible && !e.frozen && e.ready && e.contains(node.getExtent())
                && !node.canSubdivide()) {
                return false;
            }
        }

        if (node.children.some(n => isTileMesh(n))) {
            // No need to prevent subdivision, since we've already done it before
            return true;
        }

        return true;
    }

    private testTileSSE(tile: TileMesh, sse: SSE) {
        if (this.maxSubdivisionLevel <= tile.level) {
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
        if (values.filter(v => v < (100 * this.sseScale)).length >= 1) {
            return false;
        }
        return values.filter(v => v >= (384 * this.sseScale)).length >= 2;
    }

    private updateMinMaxDistance(context: Context, node: TileMesh) {
        const bbox = node.OBB.box3D.clone()
            .applyMatrix4(node.OBB.matrixWorld);
        const distance = context.distance.plane
            .distanceToPoint(bbox.getCenter(tmpVector));
        const radius = bbox.getSize(tmpVector).length() * 0.5;
        this._distance.min = Math.min(this._distance.min, distance - radius);
        this._distance.max = Math.max(this._distance.max, distance + radius);
    }
}

export default Map;
