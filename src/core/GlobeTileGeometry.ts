import { BufferAttribute, BufferGeometry, PlaneGeometry, Vector2, Vector3 } from 'three';
import type Extent from './geographic/Extent';
import { DEFAULT_MAP_SEGMENTS } from '../entities/Map';
import type { GetMemoryUsageContext, MemoryUsage, MemoryUsageReport } from '.';
import { createEmptyReport, getGeometryMemoryUsage } from './MemoryUsage';
import type TileGeometry from './TileGeometry';
import type HeightMap from './HeightMap';
import Ellipsoid from './geographic/Ellipsoid';

const tmpVec2 = new Vector2();
const tmpVec3 = new Vector3();
const tmpNormal = new Vector3();

enum Usage {
    Rendering,
    Raycasting,
}

const wgs84 = Ellipsoid.WGS84;

export default class GlobeTileGeometry extends BufferGeometry implements MemoryUsage, TileGeometry {
    private readonly _extent: Extent;
    private readonly _origin: Vector3;
    private _heightMap: HeightMap;
    private _segments: number = DEFAULT_MAP_SEGMENTS;
    private _raycastGeometry: BufferGeometry;

    get segments(): number {
        return this._segments;
    }

    set segments(v: number) {
        if (this._segments !== v) {
            this._segments = v;
            this.buildBuffers(this, Usage.Rendering);
            this.buildBuffers(this._raycastGeometry, Usage.Raycasting);
        }
    }

    get origin(): Vector3 {
        return this._origin;
    }

    get raycastGeometry() {
        return this._raycastGeometry;
    }

    constructor(params: { extent: Extent; segments: number }) {
        super();

        this._segments = params.segments;
        this._extent = params.extent;

        this._origin = wgs84.toCartesian(this._extent.north(), this._extent.west(), 0);

        if (this._extent.crs() !== 'EPSG:4326') {
            throw new Error(`invalid CRS. Expected EPSG:4326, got: ${this._extent.crs()}`);
        }

        this._raycastGeometry = new BufferGeometry();

        this.buildBuffers(this, Usage.Rendering);
        this.buildBuffers(this._raycastGeometry, Usage.Raycasting);
    }

    resetHeights(): void {
        this.buildBuffers(this.raycastGeometry, Usage.Raycasting);
    }

    applyHeightMap(heightMap: HeightMap): { min: number; max: number } {
        this._heightMap = heightMap;
        return this.buildBuffers(this.raycastGeometry, Usage.Raycasting);
    }

    getMemoryUsage(_: GetMemoryUsageContext, target?: MemoryUsageReport): MemoryUsageReport {
        const result = target ?? createEmptyReport();

        getGeometryMemoryUsage(this, result);
        getGeometryMemoryUsage(this.raycastGeometry, result);

        return result;
    }

    private buildBuffers(geometry: BufferGeometry, usage: Usage) {
        this.dispose();

        const rowVertices = this._segments + 1;

        const dims = this._extent.dimensions(tmpVec2);
        const width = dims.width;
        const height = dims.height;
        const west = this._extent.west();
        const north = this._extent.north();
        const origin = this._origin;

        // A shortcut to get ready to use buffers
        const geom = new PlaneGeometry(1, 1, this._segments, this._segments);

        const positions = geom.getAttribute('position').array;
        const uv = geom.getAttribute('uv').array;
        const normals = new Float32Array(positions.length);

        const heightMap = this._heightMap;

        /**
         * Returns the elevation by sampling the heightmap at the (u, v) coordinate.
         * Note: the sampling does not perform any interpolation.
         */
        function getElevation(u: number, v: number): number {
            if (!heightMap) {
                return 0;
            }

            return heightMap.getValue(u, v, true);
        }

        let min = +Infinity;
        let max = -Infinity;

        for (let j = 0; j < rowVertices; j++) {
            for (let i = 0; i < rowVertices; i++) {
                const index = j * rowVertices + i;

                const u = i / this.segments;
                const v = j / this.segments;

                const lon = west + u * width;
                const lat = north - v * height;

                const altitude = usage === Usage.Raycasting ? getElevation(u, 1 - v) : 0;

                min = Math.min(min, altitude);
                max = Math.max(max, altitude);

                const ecef = wgs84.toCartesian(lat, lon, altitude, tmpVec3);
                const normal = wgs84.getNormal(lat, lon, tmpNormal);

                const { x, y, z } = ecef.sub(origin);

                positions[index * 3 + 0] = x;
                positions[index * 3 + 1] = y;
                positions[index * 3 + 2] = z;

                normals[index * 3 + 0] = normal.x;
                normals[index * 3 + 1] = normal.y;
                normals[index * 3 + 2] = normal.z;

                uv[index * 2 + 0] = u;
                uv[index * 2 + 1] = 1 - v;
            }
        }

        geometry.setAttribute('position', new BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new BufferAttribute(uv, 2));
        geometry.setAttribute('normal', new BufferAttribute(normals, 3));
        geometry.setIndex(geom.getIndex());

        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();

        return { min, max };
    }
}
