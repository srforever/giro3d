import {
    Mesh,
    Vector2,
    Vector4,
    type WebGLRenderTarget,
    type Object3DEventMap,
    type Texture,
    type Object3D,
    UnsignedByteType,
    RGBAFormat,
    MeshBasicMaterial,
    type Intersection,
    type Raycaster,
    Ray,
    Matrix4,
    Box3,
    Vector3,
} from 'three';

import MemoryTracker from '../renderer/MemoryTracker';
import type LayeredMaterial from '../renderer/LayeredMaterial';
import type { MaterialOptions } from '../renderer/LayeredMaterial';
import type Extent from './geographic/Extent';
import TileGeometry from './TileGeometry';
import type RenderingState from '../renderer/RenderingState';
import ElevationLayer from './layer/ElevationLayer';
import type Disposable from './Disposable';
import type MemoryUsage from './MemoryUsage';
import {
    createEmptyReport,
    type GetMemoryUsageContext,
    type MemoryUsageReport,
} from './MemoryUsage';
import type OffsetScale from './OffsetScale';
import type Instance from './Instance';
import HeightMap from './HeightMap';
import type Layer from './layer/Layer';
import type UniqueOwner from './UniqueOwner';
import { intoUniqueOwner } from './UniqueOwner';
import TextureGenerator from '../utils/TextureGenerator';
import type GetElevationOptions from '../entities/GetElevationOptions';
import { type NeighbourList } from './TileIndex';

const ray = new Ray();
const inverseMatrix = new Matrix4();

const helperMaterial = new MeshBasicMaterial({
    color: '#75eba8',
    depthTest: false,
    depthWrite: false,
    wireframe: true,
    transparent: true,
});

const NO_NEIGHBOUR = -99;
const VECTOR4_ZERO = new Vector4(0, 0, 0, 0);
const tempVec2 = new Vector2();
const tempVec3 = new Vector3();

type GeometryPool = Map<string, TileGeometry>;

function makePooledGeometry(pool: GeometryPool, extent: Extent, segments: number, level: number) {
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

function makeRaycastableGeometry(extent: Extent, segments: number) {
    const dimensions = extent.dimensions();
    const geometry = new TileGeometry({ dimensions, segments });
    return geometry;
}

export interface TileMeshEventMap extends Object3DEventMap {
    'visibility-changed': {
        /** empty */
    };
    dispose: {
        /** empty */
    };
}

class TileVolume {
    private readonly _localBox: Box3;
    private readonly _owner: Object3D<Object3DEventMap>;

    constructor(options: { extent: Extent; min: number; max: number; owner: Object3D }) {
        const dims = options.extent.dimensions(tempVec2);
        const width = dims.x;
        const height = dims.y;
        const min = new Vector3(-width / 2, -height / 2, options.min);
        const max = new Vector3(+width / 2, +height / 2, options.max);
        this._localBox = new Box3(min, max);
        this._owner = options.owner;
    }

    get centerZ() {
        return this.localBox.getCenter(tempVec3).z;
    }

    get localBox(): Readonly<Box3> {
        return this._localBox;
    }

    /**
     * Gets or set the min altitude, in local coordinates.
     */
    get zMin() {
        return this._localBox.min.z;
    }

    set zMin(v: number) {
        this._localBox.min.setZ(v);
    }

    /**
     * Gets or set the max altitude, in local coordinates.
     */
    get zMax() {
        return this._localBox.max.z;
    }

    set zMax(v: number) {
        this._localBox.max.setZ(v);
    }

    /**
     * Returns the local size of this volume.
     */
    getLocalSize(target: Vector3): Vector3 {
        return this._localBox.getSize(target);
    }

    /**
     * Returns the local bounding box.
     */
    getLocalBoundingBox(target?: Box3): Box3 {
        const result = target ?? new Box3();

        result.copy(this._localBox);

        return result;
    }

    /**
     * Gets the world bounding box, taking into account world transformation.
     */
    getWorldSpaceBoundingBox(target?: Box3): Box3 {
        const result = target ?? new Box3();

        result.copy(this._localBox);

        this._owner.updateWorldMatrix(true, false);

        result.applyMatrix4(this._owner.matrixWorld);

        return result;
    }
}

class TileMesh
    extends Mesh<TileGeometry, LayeredMaterial, TileMeshEventMap>
    implements Disposable, MemoryUsage
{
    private readonly _pool: GeometryPool;
    private _segments: number;
    readonly type: string = 'TileMesh';
    readonly isTileMesh: boolean = true;
    private _minmax: { min: number; max: number };
    readonly extent: Extent;
    readonly textureSize: Vector2;
    private readonly _volume: TileVolume;
    readonly level: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    private _heightMap: UniqueOwner<HeightMap, this>;
    disposed = false;
    private _enableTerrainDeformation: boolean;
    private readonly _enableCPUTerrain: boolean;
    private readonly _instance: Instance;
    private readonly _onElevationChanged: (tile: this) => void;
    private _shouldUpdateHeightMap = false;
    isLeaf = false;
    private _elevationLayerInfo: {
        layer: ElevationLayer;
        offsetScale: OffsetScale;
        renderTarget: WebGLRenderTarget<Texture>;
    };
    private _helperMesh: Mesh<TileGeometry, MeshBasicMaterial, Object3DEventMap>;

    getMemoryUsage(context: GetMemoryUsageContext, target?: MemoryUsageReport): MemoryUsageReport {
        const result = target ?? createEmptyReport();

        this.material?.getMemoryUsage(context, result);

        // We only count what we own, otherwise the same heightmap will be counted more than once.
        if (this._heightMap && this._heightMap.owner === this) {
            result.cpuMemory += this._heightMap.payload.buffer.byteLength;
        }
        // If CPU terrain is enabled, then the geometry is owned by this mesh, rather than
        // shared with other meshes in the same map, so we have to count it.
        if (this._enableCPUTerrain) {
            this.geometry.getMemoryUsage(context, result);
        }

        return result;
    }

    get boundingBox(): Box3 {
        if (!this._enableTerrainDeformation) {
            this._volume.zMin = 0;
            this._volume.zMax = 0;
        } else {
            this._volume.zMin = this.minmax.min;
            this._volume.zMax = this.minmax.max;
        }
        return this._volume.localBox;
    }

    getWorldSpaceBoundingBox(target: Box3): Box3 {
        return this._volume.getWorldSpaceBoundingBox(target);
    }

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
        instance,
        enableCPUTerrain,
        enableTerrainDeformation,
        onElevationChanged,
    }: {
        /** The geometry pool to use. */
        geometryPool?: GeometryPool;
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
        instance: Instance;
        enableCPUTerrain: boolean;
        enableTerrainDeformation: boolean;
        onElevationChanged: (tile: TileMesh) => void;
    }) {
        super(
            // CPU terrain forces geometries to be unique, so cannot be pooled
            enableCPUTerrain
                ? makeRaycastableGeometry(extent, segments)
                : makePooledGeometry(geometryPool, extent, segments, level),
            material,
        );

        this._pool = geometryPool;
        this._segments = segments;
        this._instance = instance;
        this._onElevationChanged = onElevationChanged;

        this.matrixAutoUpdate = false;

        this.level = level;
        this.extent = extent;
        this.textureSize = textureSize;
        this._enableCPUTerrain = enableCPUTerrain;
        this._enableTerrainDeformation = enableTerrainDeformation;

        this._volume = new TileVolume({
            extent,
            owner: this,
            min: this.geometry.boundingBox.min.z,
            max: this.geometry.boundingBox.max.z,
        });

        this.name = `tile @ (z=${level}, x=${x}, y=${y})`;

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

    get showHelpers() {
        if (!this._helperMesh) {
            return false;
        }
        return this._helperMesh.material.visible;
    }

    set showHelpers(visible: boolean) {
        if (visible && !this._helperMesh) {
            this._helperMesh = new Mesh(this.geometry, helperMaterial);
            this._helperMesh.matrixAutoUpdate = false;
            this._helperMesh.name = 'collider helper';
            this.add(this._helperMesh);
            this._helperMesh.updateMatrix();
            this._helperMesh.updateMatrixWorld(true);
        }

        if (!visible && this._helperMesh) {
            this._helperMesh.removeFromParent();
            this._helperMesh = null;
        }

        if (this._helperMesh) {
            this._helperMesh.material.visible = visible;
        }
    }

    get segments() {
        return this._segments;
    }

    set segments(v) {
        if (this._segments !== v) {
            this._segments = v;
            this.createGeometry();
            this.material.segments = v;
            if (this._enableCPUTerrain) {
                this._shouldUpdateHeightMap = true;
            }
        }
    }

    private createGeometry() {
        this.geometry = this._enableCPUTerrain
            ? makeRaycastableGeometry(this.extent, this._segments)
            : makePooledGeometry(this._pool, this.extent, this._segments, this.level);
        if (this._helperMesh) {
            this._helperMesh.geometry = this.geometry;
        }
    }

    onLayerVisibilityChanged(layer: Layer) {
        if (layer instanceof ElevationLayer && this._enableCPUTerrain) {
            this._shouldUpdateHeightMap = true;
        }
    }

    addChildTile(tile: TileMesh) {
        this.add(tile);
        if (this._heightMap) {
            const heightMap = this._heightMap.payload;
            const inheritedHeightMap = heightMap.clone();
            const offsetScale = tile.extent.offsetToParent(this.extent);
            heightMap.offsetScale.combine(offsetScale, inheritedHeightMap.offsetScale);
            tile.inheritHeightMap(intoUniqueOwner(inheritedHeightMap, this));
        }
    }

    reorderLayers() {
        this.material.reorderLayers();
    }

    /**
     * Checks that the given raycaster intersects with this tile's volume.
     */
    private checkRayVolumeIntersection(raycaster: Raycaster): boolean {
        const matrixWorld = this.matrixWorld;

        // convert ray to local space of mesh

        inverseMatrix.copy(matrixWorld).invert();
        ray.copy(raycaster.ray).applyMatrix4(inverseMatrix);

        // test with bounding box in local space

        // Note that we are not using the bounding box of the geometry, because at this moment,
        // the mesh might still be completely flat, as the heightmap might not be computed yet.
        // This is the whole point of this method: to avoid computing the heightmap if not necessary.
        // So we are using the logical bounding box provided by the volume.
        return ray.intersectsBox(this.boundingBox);
    }

    override raycast(raycaster: Raycaster, intersects: Intersection[]): void {
        // Updating the heightmap is quite costly operation that requires a texture readback.
        // Let's do it only if the ray intersects the volume of this tile.
        if (this.checkRayVolumeIntersection(raycaster)) {
            this.updateHeightMapIfNecessary();
            super.raycast(raycaster, intersects);
        }
    }

    private updateHeightMapIfNecessary(): void {
        if (this._shouldUpdateHeightMap && this._enableCPUTerrain) {
            this._shouldUpdateHeightMap = false;

            if (this._elevationLayerInfo) {
                this.createHeightMap(
                    this._elevationLayerInfo.renderTarget,
                    this._elevationLayerInfo.offsetScale,
                );

                const shouldHeightmapBeActive =
                    this._elevationLayerInfo.layer.visible && this._enableTerrainDeformation;

                if (shouldHeightmapBeActive) {
                    this.applyHeightMap();
                } else {
                    this.resetHeights();
                }
            }
        }
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
        const nOffsetScale = neighbourElevation.offsetScale.combine(offsetScale);

        uniform.offsetScale = nOffsetScale;
        uniform.diffLevel = diff;
        uniform.elevationTexture = neighbourElevation.texture;
    }

    /**
     * @param neighbours - The neighbours.
     */
    processNeighbours(neighbours: NeighbourList<TileMesh>) {
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
        if (this._enableCPUTerrain && this._heightMap && this._elevationLayerInfo) {
            if (this._enableTerrainDeformation !== materialOptions.terrain.enabled) {
                this._enableTerrainDeformation = materialOptions.terrain.enabled;
                this._shouldUpdateHeightMap = true;
            }
        }

        this.showHelpers = materialOptions.showColliderMeshes ?? false;
    }

    isVisible() {
        return this.visible;
    }

    setDisplayed(show: boolean) {
        const currentVisibility = this.material.visible;
        this.material.visible = show && this.material.update();
        if (this._helperMesh) {
            this._helperMesh.visible = this.material.visible;
        }
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
        this._elevationLayerInfo = null;
        this._shouldUpdateHeightMap = true;
        this.material.removeElevationLayer();
    }

    setElevationTexture(
        layer: ElevationLayer,
        elevation: {
            texture: Texture;
            pitch: OffsetScale;
            min: number;
            max: number;
            renderTarget?: WebGLRenderTarget;
        },
        isFinal = false,
    ) {
        if (this.disposed) {
            return;
        }

        this._elevationLayerInfo = {
            layer,
            offsetScale: elevation.pitch,
            renderTarget: elevation.renderTarget,
        };

        this.material.setElevationTexture(layer, elevation, isFinal);

        this.setBBoxZ(elevation.min, elevation.max);

        if (this._enableCPUTerrain) {
            this._shouldUpdateHeightMap = true;
        }

        this._onElevationChanged(this);
    }

    private createHeightMap(renderTarget: WebGLRenderTarget, offsetScale: OffsetScale) {
        const outputHeight = Math.floor(renderTarget.height);
        const outputWidth = Math.floor(renderTarget.width);

        // On millimeter
        const precision = 0.001;

        // To ensure that all values are positive before encoding
        const offset = -this._minmax.min;

        const buffer = TextureGenerator.readRGRenderTargetIntoRGBAU8Buffer({
            renderTarget,
            renderer: this._instance.renderer,
            outputWidth,
            outputHeight,
            precision,
            offset,
        });

        const heightMap = new HeightMap(
            buffer,
            outputWidth,
            outputHeight,
            offsetScale,
            RGBAFormat,
            UnsignedByteType,
            precision,
            offset,
        );
        this._heightMap = intoUniqueOwner(heightMap, this);
    }

    private inheritHeightMap(heightMap: UniqueOwner<HeightMap, this>) {
        this._heightMap = heightMap;
        this._shouldUpdateHeightMap = true;
    }

    private resetHeights() {
        this.geometry.resetHeights();
        this.setBBoxZ(0, 0);

        this._onElevationChanged(this);
    }

    private applyHeightMap() {
        if (!this._heightMap) {
            return;
        }

        const { min, max } = this.geometry.applyHeightMap(this._heightMap.payload);

        if (min > this._minmax.min && max < this._minmax.max) {
            this.setBBoxZ(min, max);
        }

        this._onElevationChanged(this);
    }

    setBBoxZ(min: number, max: number) {
        // 0 is an acceptable value
        if (min == null && max == null) {
            return;
        }
        this._minmax = { min, max };

        this.updateVolume(min, max);
    }

    traverseTiles(callback: (descendant: TileMesh) => void) {
        this.traverse(obj => {
            if (isTileMesh(obj)) {
                callback(obj);
            }
        });
    }

    /**
     * Removes the child tiles and returns the detached tiles.
     */
    detachChildren(): TileMesh[] {
        const childTiles = this.children.filter(c => isTileMesh(c)) as TileMesh[];
        childTiles.forEach(c => c.dispose());
        this.remove(...childTiles);
        return childTiles;
    }

    private updateVolume(min: number, max: number) {
        const v = this._volume;
        if (Math.floor(min) !== Math.floor(v.zMin) || Math.floor(max) !== Math.floor(v.zMax)) {
            this._volume.zMin = min;
            this._volume.zMax = max;
        }
    }

    get minmax() {
        return this._minmax;
    }

    getExtent() {
        return this.extent;
    }

    getElevation(params: GetElevationOptions): { elevation: number; resolution: number } | null {
        this.updateHeightMapIfNecessary();

        if (this._heightMap) {
            const uv = this.extent.offsetInExtent(params.coordinates, tempVec2);

            const heightMap = this._heightMap.payload;
            const elevation = heightMap.getValue(uv.x, uv.y);

            if (elevation) {
                const dims = this.extent.dimensions(tempVec2);
                const xRes = dims.x / heightMap.width;
                const yRes = dims.y / heightMap.height;
                const resolution = Math.min(xRes, yRes);

                return { elevation, resolution };
            }
        }

        return null;
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
        this.dispatchEvent({ type: 'dispose' });
        this.material.dispose();
        if (this._enableCPUTerrain) {
            // When colliders are enabled, geometries are created for each tile,
            // and thus must be disposed when the mesh is disposed.
            this.geometry.dispose();
        }
    }
}

export function isTileMesh(o: unknown): o is TileMesh {
    return (o as TileMesh).isTileMesh;
}

export default TileMesh;
