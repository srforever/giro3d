/**
 * Options for geometric terrain rendering.
 */
export default interface TerrainOptions {
    /**
     * Enables terrain deformation. If `true`, the surface of the map will be deformed to
     * match the elevation data. If `false` or unset, the surface of the map will be flat.
     */
    enabled?: boolean;
    /**
     * Enables terrain stitching. Requires {@link enabled} to be `true`.
     */
    stitching?: boolean;
}
