import { BufferAttribute, BufferGeometry, MathUtils, PlaneGeometry, Vector2, Vector3 } from 'three';
import type Extent from './geographic/Extent';
import { DEFAULT_MAP_SEGMENTS } from '../entities/Map';
import type { GetMemoryUsageContext, MemoryUsage, MemoryUsageReport } from '.';
import { createEmptyReport } from './MemoryUsage';
import type TileGeometry from './TileGeometry';
import type HeightMap from './HeightMap';

const tmpVec2 = new Vector2();
const tmpVec3 = new Vector3();
const tmpNormal = new Vector3();

const WGS84_A = 6_378_137.0;
const WGS84_IF = 298.257223563;
const WGS84_F = 1 / WGS84_IF;
const WGS84_E = Math.sqrt(2 * WGS84_F - WGS84_F * WGS84_F);

function latLonToEcef(lat: number, lon: number, alt: number, target: Vector3): Vector3 {
    const clat = Math.cos(lat * MathUtils.DEG2RAD);
    const slat = Math.sin(lat * MathUtils.DEG2RAD);
    const clon = Math.cos(lon * MathUtils.DEG2RAD);
    const slon = Math.sin(lon * MathUtils.DEG2RAD);

    const N = WGS84_A / Math.sqrt(1.0 - WGS84_E * WGS84_E * slat * slat);

    const x = (N + alt) * clat * clon;
    const y = (N + alt) * clat * slon;
    const z = (N * (1.0 - WGS84_E * WGS84_E) + alt) * slat;

    target.set(x, y, z);

    return target;
}

export default class GlobeTileGeometry extends BufferGeometry implements MemoryUsage, TileGeometry {
    private readonly _extent: Extent;
    private readonly _origin: Vector3;
    private _heightMap: HeightMap;
    private _segments: number = DEFAULT_MAP_SEGMENTS;

    get segments(): number {
        return this._segments;
    }

    set segments(v: number) {
        if (this._segments !== v) {
            this._segments = v;
            this.buildBuffers();
        }
    }

    get origin(): Vector3 {
        return this._origin;
    }

    constructor(params: { extent: Extent; segments: number }) {
        super();

        this._segments = params.segments;
        this._extent = params.extent;

        // TODO avoid sampling the heightmap for really big tiles, as it has no visible effect.
        // TODO sample heightmap
        this._origin = latLonToEcef(this._extent.north(), this._extent.west(), 0, new Vector3());

        if (this._extent.crs() !== 'EPSG:4326') {
            throw new Error(`invalid CRS. Expected EPSG:4326, got: ${this._extent.crs()}`);
        }

        this.buildBuffers();
    }

    resetHeights(): void {
        // TODO
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    applyHeightMap(heightMap: HeightMap): { min: number; max: number } {
        // TODO
        return { min: 0, max: 0 };
    }

    getMemoryUsage(_: GetMemoryUsageContext, target?: MemoryUsageReport): MemoryUsageReport {
        const result = target ?? createEmptyReport();

        for (const attribute of Object.values(this.attributes)) {
            const bytes = attribute.array.byteLength;
            result.cpuMemory += bytes;
            result.gpuMemory += bytes;
        }

        if (this.index) {
            const bytes = this.index.array.byteLength;

            result.cpuMemory += bytes;
            result.gpuMemory += bytes;
        }

        return result;
    }

    private buildBuffers() {
        this.dispose();

        const rowVertices = this._segments + 1;

        const dims = this._extent.dimensions(tmpVec2);
        const width = dims.width;
        const height = dims.height;
        const west = this._extent.west();
        const north = this._extent.north();
        const origin = this._origin;

        const geom = new PlaneGeometry(1, 1, this._segments, this._segments);

        const positions = geom.getAttribute('position').array;
        const uv = geom.getAttribute('uv').array;
        const normals = new Float32Array(positions.length);

        for (let j = 0; j < rowVertices; j++) {
            for (let i = 0; i < rowVertices; i++) {
                const index = j * rowVertices + i;

                const u = i / this.segments;
                const v = j / this.segments;

                const lon = west + u * width;
                const lat = north - v * height;

                const ecef = latLonToEcef(lat, lon, 0, tmpVec3);
                // In ECEF, the normal vector is just the normalized position,
                // Since the center of the earth is at (0, 0, 0).
                const normal = tmpNormal.copy(ecef).normalize();

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

        this.setAttribute('position', new BufferAttribute(positions, 3));
        this.setAttribute('uv', new BufferAttribute(uv, 2));
        this.setAttribute('normal', new BufferAttribute(normals, 3));
        this.setIndex(geom.getIndex());

        this.computeBoundingSphere();
        this.computeBoundingBox();
    }
}
