import {
    Mesh,
    Vector4,
    type Object3DEventMap,
    type Vector2,
    type Texture,
    type Object3D,
} from 'three';

import MemoryTracker from '../renderer/MemoryTracker.js';
import type LayeredMaterial from '../renderer/LayeredMaterial.js';
import type Extent from './geographic/Extent.js';
import TileGeometry from './TileGeometry.js';
import type OBB from './OBB.js';
import type RenderingState from '../renderer/RenderingState.js';
import type ElevationLayer from './layer/ElevationLayer.js';
import type TileIndex from './TileIndex';

const NO_NEIGHBOUR = -99;
const VECTOR4_ZERO = new Vector4(0, 0, 0, 0);

interface Owner {
    id: string;
    geometryPool: Map<string, TileGeometry>;
    tileIndex: TileIndex;
}

function makeGeometry(map: Owner, extent: Extent, segments: number, level: number) {
    const pool = map.geometryPool;

    const key = `${segments}-${level}`;

    const cached = pool.get(key);
    if (cached) {
        return cached;
    }

    const dimensions = extent.dimensions();
    const geometry = new TileGeometry({ dimensions, segments });
    if (MemoryTracker.enable) {
        MemoryTracker.track(geometry, `TileGeometry (map=${map.id}, segments=${segments}, level=${level})`);
    }
    pool.set(key, geometry);
    return geometry;
}

export interface TileMeshEventMap extends Object3DEventMap {
    'dispose': {};
}

class TileMesh extends Mesh<TileGeometry, LayeredMaterial, TileMeshEventMap> {
    layer: any;
    private _segments: number;
    readonly isTileMesh: boolean = true;
    extent: Extent;
    textureSize: Vector2;
    obb: OBB;
    level: number;
    x: number;
    y: number;
    z: number;
    disposed: boolean;

    /**
     * Creates an instance of TileMesh.
     *
     * @param options Constructor options.
     * @param options.map The Map that owns this tile.
     * @param options.material The tile material.
     * @param options.extent The tile extent.
     * @param options.segments The subdivisions.
     * @param options.coord The tile coordinate.
     * @param options.coord.level The tile depth level in the hierarchy.
     * @param options.coord.x The tile X coordinate in the grid.
     * @param options.coord.y The tile Y coordinate in the grid.
     * @param options.textureSize The texture size.
     */
    constructor({
        map,
        material,
        extent,
        segments,
        coord: { level, x = 0, y = 0 },
        textureSize,
    }: {
        map: Owner;
        material: LayeredMaterial;
        extent: Extent;
        segments: number;
        coord: { level: number; x: number; y: number; };
        textureSize: Vector2;
    }) {
        super(makeGeometry(map, extent, segments, level), material);

        this.layer = map;
        this._segments = segments;
        this.isTileMesh = true;

        this.matrixAutoUpdate = false;

        this.level = level;
        this.extent = extent;
        this.textureSize = textureSize;

        // Needs to clone it because the geometry is not copied anymore
        this.obb = this.geometry.OBB.clone();

        this.name = `tile @ (z=${level}, x=${x}, y=${y})`;
        this.obb.name = 'obb';

        this.frustumCulled = false;

        // Layer
        this.setDisplayed(false);

        this.material.setUuid(this.id);
        const dim = extent.dimensions();
        this.material.uniforms.tileDimensions.value.set(dim.x, dim.y);

        // Sets the default bbox volume
        this.setBBoxZ(-0.5, +0.5);

        this.x = x;
        this.y = y;
        this.z = level;
        map.tileIndex.addTile(this);

        MemoryTracker.track(this, this.name);
    }

    get segments() {
        return this._segments;
    }

    set segments(v) {
        if (this._segments !== v) {
            this._segments = v;
            this.geometry = makeGeometry(this.layer, this.extent, this._segments, this.level);
            this.material.segments = v;
        }
    }

    reorderLayers() {
        this.material.reorderLayers();
    }

    /**
     * @param neighbour The neighbour.
     * @param location Its location in the neighbour array.
     */
    private processNeighbour(neighbour: TileMesh, location: number) {
        const diff = neighbour.level - this.level;

        const uniform = this.material.uniforms.neighbours.value[location];
        const neighbourElevation = neighbour.material.texturesInfo.elevation;

        const offsetScale = this.extent.offsetToParent(neighbour.extent);
        const nOffsetScale = neighbourElevation.offsetScale.clone();

        nOffsetScale.x += offsetScale.x * nOffsetScale.z;
        nOffsetScale.y += offsetScale.y * nOffsetScale.w;
        nOffsetScale.z *= offsetScale.z;
        nOffsetScale.w *= offsetScale.w;

        uniform.offsetScale = nOffsetScale;
        uniform.diffLevel = diff;
        uniform.elevationTexture = neighbourElevation.texture;
    }

    /**
     * @param neighbours The neighbours.
     */
    processNeighbours(neighbours: TileMesh[]) {
        for (let i = 0; i < neighbours.length; i++) {
            const neighbour = neighbours[i];
            if (neighbour && neighbour.material && neighbour.material.visible) {
                this.processNeighbour(neighbour, i);
            } else {
                const uniform = this.material.uniforms.neighbours.value[i];
                uniform.diffLevel = NO_NEIGHBOUR;
                uniform.offsetScale = VECTOR4_ZERO;
                uniform.elevationTexture = undefined;
            }
        }
    }

    updateMatrixWorld(force: boolean) {
        super.updateMatrixWorld.call(this, force);
        this.OBB().update();
    }

    isVisible() {
        return this.visible;
    }

    setDisplayed(show: boolean) {
        this.material.visible = show && this.material.update();
    }

    /**
     * @param v The new opacity.
     */
    set opacity(v: number) {
        this.material.opacity = v;
    }

    setVisibility(show: boolean) {
        this.visible = show;
    }

    isDisplayed() {
        return this.material.visible;
    }

    /**
     * Updates the rendering state of the tile's material.
     *
     * @param state The new rendering state.
     */
    changeState(state: RenderingState) {
        this.material.changeState(state);
    }

    static applyChangeState(o: Object3D, s: RenderingState) {
        if ((o as TileMesh).isTileMesh) {
            (o as TileMesh).changeState(s);
        }
    }

    pushRenderState(state: RenderingState) {
        if (this.material.uniforms.renderingState.value === state) {
            return () => { };
        }

        const oldState = this.material.uniforms.renderingState.value;
        this.traverse(n => TileMesh.applyChangeState(n, state));

        return () => {
            this.traverse(n => TileMesh.applyChangeState(n, oldState));
        };
    }

    canSubdivide() {
        let current: TileMesh = this;
        let ancestorLevel = 0;

        // To be able to subdivide a tile, we need to ensure that we
        // have proper elevation data on this tile (if applicable).
        // Otherwise the newly created tiles will not have a correct bounding box,
        // and this will mess with frustum culling / level of detail selection, in turn leading
        // to dangerous levels of subdivisions (and hundreds/thousands of undesired tiles).
        // On the other hand, we can afford a bit of undesired tiles if it means that
        // the color layers will display correctly.
        const LOD_MARGIN = 3;
        while (ancestorLevel < LOD_MARGIN && current != null) {
            if (current && current.material && current.material.isElevationLayerTextureLoaded()) {
                return true;
            }
            ancestorLevel++;
            current = this.parent as TileMesh;
        }

        return false;
    }

    removeElevationTexture() {
        this.material.removeElevationLayer();
    }

    setElevationTexture(layer: ElevationLayer, elevation: {
        texture: Texture;
        pitch: Vector4;
        min: number;
        max: number;
    }, isFinal = false) {
        if (this.material === null) {
            return;
        }
        this.setBBoxZ(elevation.min, elevation.max);
        this.material.setElevationTexture(layer, elevation, isFinal);
    }

    setBBoxZ(min: number, max: number) {
        // 0 is an acceptable value
        if (min == null && max == null) {
            return;
        }
        if (Math.floor(min) !== Math.floor(this.obb.z.min)
            || Math.floor(max) !== Math.floor(this.obb.z.max)) {
            this.OBB().updateZ(min, max);
        }
    }

    /**
     * @returns The Oriented Bounding Box.
     */
    OBB() {
        return this.obb;
    }

    getExtent() {
        return this.extent;
    }

    /**
     * Gets whether this mesh is currently performing processing.
     *
     * @returns `true` if the mesh is currently performing processing, `false` otherwise.
     */
    get loading() {
        return this.material.loading;
    }

    /**
     * Gets the progress percentage (normalized in [0, 1] range) of the processing.
     *
     * @returns The progress percentage.
     */
    get progress() {
        return this.material.progress;
    }

    /**
     * Search for a common ancestor between this tile and another one. It goes
     * through parents on each side until one is found.
     *
     * @param tile the tile to evaluate
     * @returns the resulting common ancestor
     */
    findCommonAncestor(tile: TileMesh): TileMesh {
        if (!tile) {
            return undefined;
        }
        if (tile.level === this.level) {
            if (tile.id === this.id) {
                return tile;
            }
            if (tile.level !== 0) {
                return (this.parent as TileMesh).findCommonAncestor(tile.parent as TileMesh);
            }
            return undefined;
        }
        if (tile.level < this.level) {
            return (this.parent as TileMesh).findCommonAncestor(tile);
        }
        return this.findCommonAncestor(tile.parent as TileMesh);
    }

    isAncestorOf(node: TileMesh) {
        return node.findCommonAncestor(this) === this;
    }

    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.dispatchEvent({ type: 'dispose' });
        this.material.dispose();
        // We don't dispose the geometry because we don't own it.
        // It is shared between all TileMesh objects of the same depth level.
        this.material = null;
        this.geometry = null;
    }
}
export default TileMesh;
