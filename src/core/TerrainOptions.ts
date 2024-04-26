export const DEFAULT_ENABLE_TERRAIN = true;
export const DEFAULT_ENABLE_CPU_TERRAIN = true;
export const DEFAULT_ENABLE_STITCHING = true;

/**
 * Options for geometric terrain rendering.
 */
export default interface TerrainOptions {
    /**
     * Enables terrain deformation. If `true`, the surface of the map will be deformed to
     * match the elevation data. If `false` or unset, the surface of the map will be flat.
     * @defaultValue {@link DEFAULT_ENABLE_TERRAIN}
     */
    enabled?: boolean;
    /**
     * Requires {@link enabled} to be `true`.
     *
     * Enables terrain stitching. Stitching allows the map to be perfectly watertight at the seams
     * between tiles, even when the neighbouring tile have different sizes.
     *
     * Disabling stitching might improve performance.
     * @defaultValue {@link DEFAULT_ENABLE_STITCHING}
     */
    stitching?: boolean;
    /**
     * Requires {@link enabled} to be `true`
     *
     * Computes the actual terrain mesh in CPU, in addition to GPU. Required to perform raycasting
     * or collision detection with the map's surface, as well as elevation queries.
     *
     * Disabling CPU terrain might improve performance and reduce memory usage.
     * @defaultValue {@link DEFAULT_ENABLE_CPU_TERRAIN}
     */
    enableCPUTerrain?: boolean;
}
