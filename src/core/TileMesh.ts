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
    MathUtils,
    Sphere,
} from 'three';

import MemoryTracker from '../renderer/MemoryTracker';
import type LayeredMaterial from '../renderer/LayeredMaterial';
import type { MaterialOptions } from '../renderer/LayeredMaterial';
import type Extent from './geographic/Extent';
import type TileGeometry from './TileGeometry';
import GlobeTileGeometry from './GlobeTileGeometry';
import ProjectedTileGeometry from './ProjectedTileGeometry';
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
import { Coordinates } from './geographic';
import type Camera from '../renderer/Camera';
import { isOrthographicCamera, isPerspectiveCamera } from '../renderer/Camera';
import Ellipsoid from './geographic/Ellipsoid';

const ray = new Ray();
const inverseMatrix = new Matrix4();
const tmpBox = new Box3();
const tmpSphere = new Sphere();
const tmpCoordWGS84 = new Coordinates('EPSG:4326', 0, 0);

const wgs84 = Ellipsoid.WGS84;

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

    const geometry = new ProjectedTileGeometry({ extent, segments });
    pool.set(key, geometry);
    return geometry;
}

function makeRaycastableGeometry(extent: Extent, segments: number) {
    const geometry =
        extent.crs() === 'EPSG:4326'
            ? new GlobeTileGeometry({ extent, segments })
            : new ProjectedTileGeometry({ extent, segments });
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
    protected readonly _localBox: Box3;
    private readonly _owner: Object3D<Object3DEventMap>;

    constructor(options: { extent: Extent; min: number; max: number; owner: Object3D }) {
        this._owner = options.owner;
        this._localBox = this.computeLocalBox(options.extent, options.min, options.max);
    }

    protected computeLocalBox(extent: Extent, minAltitude: number, maxAltitude: number): Box3 {
        const dims = extent.dimensions(tempVec2);
        const width = dims.x;
        const height = dims.y;
        const min = new Vector3(-width / 2, -height / 2, minAltitude);
        const max = new Vector3(+width / 2, +height / 2, maxAltitude);
        return new Box3(min, max);
    }

    get centerZ() {
        return this.localBox.getCenter(tempVec3).z;
    }

    get localBox(): Readonly<Box3> {
        return this._localBox;
    }

    getCorners(): Vector3[] {
        const bbox = this.getWorldSpaceBoundingBox(tmpBox);
        const c0 = new Vector3(bbox.min.x, bbox.min.y, bbox.min.z);
        const c1 = new Vector3(bbox.min.x, bbox.min.y, bbox.max.z);

        const c2 = new Vector3(bbox.max.x, bbox.min.y, bbox.min.z);
        const c3 = new Vector3(bbox.max.x, bbox.min.y, bbox.max.z);

        const c4 = new Vector3(bbox.max.x, bbox.max.y, bbox.min.z);
        const c5 = new Vector3(bbox.max.x, bbox.max.y, bbox.max.z);

        const c6 = new Vector3(bbox.min.x, bbox.max.y, bbox.min.z);
        const c7 = new Vector3(bbox.min.x, bbox.max.y, bbox.max.z);

        return [c0, c1, c2, c3, c4, c5, c6, c7];
    }

    setMinMax(min: number, max: number) {
        this._localBox.min.setZ(min);
        this._localBox.max.setZ(max);
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

    getWorldSpaceBoundingSphere(target?: Sphere): Sphere {
        return this.getWorldSpaceBoundingBox(tmpBox).getBoundingSphere(target ?? new Sphere());
    }
}

class GlobeTileVolume extends TileVolume {
    private readonly _extent: Extent;
    private _corners: Vector3[];
    private _max = 0;
    private _min = 0;

    constructor(options: { extent: Extent; min: number; max: number; owner: Object3D }) {
        super(options);

        this._extent = options.extent;
    }

    getCorners(): Vector3[] {
        if (this._corners == null) {
            const dims = this._extent.dimensions(tempVec2);

            const xCount = MathUtils.clamp(Math.round(dims.width / 5) + 1, 2, 6);
            const yCount = MathUtils.clamp(Math.round(dims.height / 5) + 1, 2, 6);

            this._corners = new Array(xCount * yCount);
            const uStep = 1 / (xCount - 1);
            const jStep = 1 / (yCount - 1);

            let index = 0;
            for (let i = 0; i < xCount; i++) {
                for (let j = 0; j < yCount; j++) {
                    const u = i * uStep;
                    const v = j * jStep;

                    const lonlat = this._extent.sample(u, v, tempVec2);

                    const p0 = wgs84.toCartesian(lonlat.y, lonlat.x, this._min);
                    const p1 = wgs84.toCartesian(lonlat.y, lonlat.x, this._max);

                    this._corners[index++] = p0;
                    this._corners[index++] = p1;
                }
            }
        }

        return this._corners;
    }

    protected override computeLocalBox(
        extent: Extent,
        minAltitude: number,
        maxAltitude: number,
    ): Box3 {
        const p0 = wgs84.toCartesian(extent.north(), extent.west(), minAltitude);
        const p1 = wgs84.toCartesian(extent.north(), extent.west(), maxAltitude);

        const p2 = wgs84.toCartesian(extent.south(), extent.west(), minAltitude);
        const p3 = wgs84.toCartesian(extent.south(), extent.west(), maxAltitude);

        const p4 = wgs84.toCartesian(extent.south(), extent.east(), minAltitude);
        const p5 = wgs84.toCartesian(extent.south(), extent.east(), maxAltitude);

        const p6 = wgs84.toCartesian(extent.north(), extent.east(), minAltitude);
        const p7 = wgs84.toCartesian(extent.north(), extent.east(), maxAltitude);

        const center = extent.center(tmpCoordWGS84);

        const p8 = wgs84.toCartesian(center.latitude, center.longitude, minAltitude);
        const p9 = wgs84.toCartesian(center.latitude, center.longitude, maxAltitude);

        const p10 = wgs84.toCartesian(extent.north(), center.longitude, minAltitude);
        const p11 = wgs84.toCartesian(extent.south(), center.longitude, maxAltitude);

        const p12 = wgs84.toCartesian(center.latitude, extent.west(), minAltitude);
        const p13 = wgs84.toCartesian(center.latitude, extent.east(), maxAltitude);

        const worldBox = new Box3().setFromPoints([
            p0,
            p1,
            p2,
            p3,
            p4,
            p5,
            p6,
            p7,
            p8,
            p9,
            p10,
            p11,
            p12,
            p13,
        ]);

        this._corners = null;

        return worldBox.setFromCenterAndSize(
            worldBox.getCenter(tempVec3).sub(p0),
            worldBox.getSize(new Vector3()),
        );
    }

    override setMinMax(min: number, max: number) {
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
            min = 0;
            max = 0;
        }
        this._min = min;
        this._max = max;
        const box = this.computeLocalBox(this._extent, min, max);
        this._localBox.copy(box);
        this._corners = null;
    }

    override getWorldSpaceBoundingSphere(target?: Sphere): Sphere {
        target = target ?? new Sphere();
        return target.setFromPoints(this.getCorners());
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
    private readonly _tileGeometry: TileGeometry;
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
            this._volume.setMinMax(0, 0);
        } else {
            this._volume.setMinMax(this.minmax.min, this.minmax.max);
        }
        return this._volume.localBox;
    }

    getWorldSpaceBoundingBox(target: Box3): Box3 {
        return this._volume.getWorldSpaceBoundingBox(target);
    }

    getWorldSpaceBoundingSphere(target: Sphere): Sphere {
        return this._volume.getWorldSpaceBoundingSphere(target);
    }

    getBoundingBoxCorners(): Vector3[] {
        return this._volume.getCorners();
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

        this._tileGeometry = this.geometry;
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

        this._volume =
            extent.crs() === 'EPSG:4326'
                ? new GlobeTileVolume({
                      extent,
                      owner: this,
                      min: -100,
                      max: +100,
                  })
                : new TileVolume({
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

        // Sets the default bbox volume
        this.setBBoxZ(-0.5, +0.5);

        this.x = x;
        this.y = y;
        this.z = level;

        MemoryTracker.track(this, this.name);
    }

    get absolutePosition() {
        return this.geometry.origin;
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
        this.attach(tile);
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

            // We have to distinguish between the rendered geometry and the raycasting geometry.
            // However, three.js does not let use choose which will be used for raycasting,
            // so we temporarily swap the geometry with the raycast geometry to perform raycasting.
            // @ts-expect-error type mismatch is expected and transient
            this.geometry = this._tileGeometry.raycastGeometry;

            super.raycast(raycaster, intersects);

            this.geometry = this._tileGeometry;
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

    getScreenPixelSize(view: Camera, target?: Vector2): Vector2 {
        target = target ?? new Vector2();

        const sphere = this.getWorldSpaceBoundingSphere(tmpSphere);

        const distance = sphere.center.distanceTo(view.camera3D.getWorldPosition(tempVec3));

        let height: number;
        let width: number;

        if (isPerspectiveCamera(view.camera3D)) {
            const fovRads = MathUtils.degToRad(view.camera3D.fov);
            height = 2 * Math.tan(fovRads / 2) * distance;
            width = height * view.camera3D.aspect;
        } else if (isOrthographicCamera(view.camera3D)) {
            height = Math.abs(view.camera3D.top - view.camera3D.bottom);
            width = Math.abs(view.camera3D.right - view.camera3D.left);
        }

        const diameter = sphere.radius * 2;

        const wRatio = diameter / width;
        const hRatio = diameter / height;

        target.setX(Math.ceil(wRatio * view.width));
        target.setY(Math.ceil(hRatio * view.height));

        return target;
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
        this._volume.setMinMax(min, max);
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
