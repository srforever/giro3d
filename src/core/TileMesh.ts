import {
    Mesh,
    Vector4,
    type Object3DEventMap,
    type Vector2,
    type Texture,
    type Object3D,
} from "three";

import MemoryTracker from "../renderer/MemoryTracker";
import type LayeredMaterial from "../renderer/LayeredMaterial";
import type { MaterialOptions } from "../renderer/LayeredMaterial";
import type Extent from "./geographic/Extent";
import TileGeometry from "./TileGeometry";
import OBB from "./OBB";
import type RenderingState from "../renderer/RenderingState";
import type ElevationLayer from "./layer/ElevationLayer";
import type Disposable from "./Disposable";

const NO_NEIGHBOUR = -99;
const VECTOR4_ZERO = new Vector4(0, 0, 0, 0);

type GeometryPool = Map<string, TileGeometry>;

function makeGeometry(pool: GeometryPool, extent: Extent, segments: number, level: number) {
    const key = `${segments}-${level}`;

    const cached = pool.get(key);
    if (cached) {
        return cached;
    }

    const dimensions = extent.dimensions();
    const geometry = new TileGeometry({ dimensions, segments });
    pool.set(key, geometry);
    return geometry;
}

export interface TileMeshEventMap extends Object3DEventMap {
    'visibility-changed': { /** empty */ },
    dispose: {
        /** empty */
    };
}

class TileMesh extends Mesh<TileGeometry, LayeredMaterial, TileMeshEventMap> implements Disposable {
    private readonly _pool: GeometryPool;
    private _segments: number;
    readonly type: string = "TileMesh";
    readonly isTileMesh: boolean = true;
    private _minmax: { min: number; max: number };
    readonly extent: Extent;
    readonly textureSize: Vector2;
    private readonly _obb: OBB;
    readonly level: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    disposed: boolean;
    private _enableTerrainDeformation: boolean;

    /**
     * Creates an instance of TileMesh.
     *
     * @param options - Constructor options.
     */
    constructor({
        geometryPool,
        material,
        extent,
        segments,
        coord: { level, x = 0, y = 0 },
        textureSize,
    }: {
        /** The geometry pool to use. */
        geometryPool: GeometryPool;
        /** The tile material. */
        material: LayeredMaterial;
        /** The tile extent. */
        extent: Extent;
        /** The subdivisions. */
        segments: number;
        /** The tile coordinate. */
        coord: { level: number; x: number; y: number };
        /** The texture size. */
        textureSize: Vector2;
    }) {
        super(makeGeometry(geometryPool, extent, segments, level), material);

        this._pool = geometryPool;
        this._segments = segments;

        this.matrixAutoUpdate = false;

        this.level = level;
        this.extent = extent;
        this.textureSize = textureSize;

        this._obb = new OBB(this.geometry.boundingBox.min, this.geometry.boundingBox.max);

        this.name = `tile @ (z=${level}, x=${x}, y=${y})`;
        this._obb.name = "obb";

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

        MemoryTracker.track(this, this.name);
    }

    get segments() {
        return this._segments;
    }

    set segments(v) {
        if (this._segments !== v) {
            this._segments = v;
            this.geometry = makeGeometry(this._pool, this.extent, this._segments, this.level);
            this.material.segments = v;
        }
    }

    reorderLayers() {
        this.material.reorderLayers();
    }

    /**
     * @param neighbour - The neighbour.
     * @param location - Its location in the neighbour array.
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
     * @param neighbours - The neighbours.
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

    update(materialOptions: MaterialOptions) {
        this._enableTerrainDeformation = materialOptions.terrain.enabled;
    }

    updateMatrixWorld(force: boolean) {
        super.updateMatrixWorld.call(this, force);
        this._obb.update();
    }

    isVisible() {
        return this.visible;
    }

    setDisplayed(show: boolean) {
        const currentVisibility = this.material.visible;
        this.material.visible = show && this.material.update();
        if (currentVisibility !== show) {
            this.dispatchEvent({ type: 'visibility-changed' });
        }
    }

    /**
     * @param v - The new opacity.
     */
    set opacity(v: number) {
        this.material.opacity = v;
    }

    setVisibility(show: boolean) {
        const currentVisibility = this.visible;
        this.visible = show;
        if (currentVisibility !== show) {
            this.dispatchEvent({ type: 'visibility-changed' });
        }
    }

    isDisplayed() {
        return this.material.visible;
    }

    /**
     * Updates the rendering state of the tile's material.
     *
     * @param state - The new rendering state.
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
            return () => {
                /** do nothing */
            };
        }

        const oldState = this.material.uniforms.renderingState.value;
        this.traverse(n => TileMesh.applyChangeState(n, state));

        return () => {
            this.traverse(n => TileMesh.applyChangeState(n, oldState));
        };
    }

    canProcessColorLayer(): boolean {
        return this.material.canProcessColorLayer();
    }

    private static canSubdivideTile(tile: TileMesh): boolean {
        let current = tile;
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
            current = current.parent as TileMesh;
        }

        return false;
    }

    canSubdivide() {
        return TileMesh.canSubdivideTile(this);
    }

    removeElevationTexture() {
        this.material.removeElevationLayer();
    }

    setElevationTexture(
        layer: ElevationLayer,
        elevation: {
            texture: Texture;
            pitch: Vector4;
            min: number;
            max: number;
        },
        isFinal = false
    ) {
        if (this.material === null) {
            return;
        }
        this.setBBoxZ(elevation.min, elevation.max);
        this._minmax = { min: elevation.min, max: elevation.max };
        this.material.setElevationTexture(layer, elevation, isFinal);
    }

    setBBoxZ(min: number, max: number) {
        // 0 is an acceptable value
        if (min == null && max == null) {
            return;
        }
        this._minmax = { min, max };
    }

    /**
     * Removes the child tiles and returns the detached tiles.
     */
    detachChildren(): TileMesh[] {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const childTiles = this.children.filter(c => isTileMesh(c)) as TileMesh[];
        childTiles.forEach(c => c.dispose());
        this.remove(...childTiles);
        return childTiles;
    }

    private updateOBB(min: number, max: number) {
        const obb = this._obb;
        if (
            Math.floor(min) !== Math.floor(obb.z.min) ||
            Math.floor(max) !== Math.floor(obb.z.max)
        ) {
            this._obb.updateZ(min, max);
        }
    }

    /**
     * @returns The Oriented Bounding Box.
     */
    get OBB() {
        if (!this._enableTerrainDeformation) {
            this.updateOBB(0, 0);
        } else {
            const { min, max } = this._minmax;
            this.updateOBB(min, max);
        }
        return this._obb;
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
     * @param tile - the tile to evaluate
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
        this.dispatchEvent({ type: "dispose" });
        this.material.dispose();
        // We don't dispose the geometry because we don't own it.
        // It is shared between all TileMesh objects of the same depth level.
        this.material = null;
        this.geometry = null;
    }
}

export function isTileMesh(o: unknown): o is TileMesh {
    return (o as TileMesh).isTileMesh;
}

export default TileMesh;
