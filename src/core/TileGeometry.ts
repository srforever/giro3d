import type { BufferGeometry, Vector3 } from 'three';
import type MemoryUsage from './MemoryUsage';
import type HeightMap from './HeightMap';

export default interface TileGeometry extends BufferGeometry, MemoryUsage {
    get segments(): number;
    set segments(v: number);

    get origin(): Vector3;

    /**
     * Resets the heights of the vertices to zero.
     */
    resetHeights(): void;

    /**
     * Applies the heightmap on the geometry.
     * @param heightMap - The heightmap to apply.
     * @returns The min and max elevation of vertices after applying the heightmap.
     */
    applyHeightMap(heightMap: HeightMap): { min: number; max: number };
}
