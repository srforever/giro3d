/**
 * Options for map hillshading.
 */
export default interface HillshadingOptions {
    /**
     * Enables hillshading.
     */
    enabled?: boolean;
    /**
     * The azimuth of the sunlight direction, in degrees (0 = north, 180 = south, etc.). Default is
     * `135`.
     */
    azimuth?: number;
    /**
     * The vertical angle of the sun, in degrees. (90 = zenith). Default is `45`.
     */
    zenith?: number;
    /**
     * The intensity of the shade (0 = no shade, 1 = completely opaque shade). Default is `1`.
     */
    intensity?: number;
    /**
     * If `true`, only elevation layers are shaded leaving the color layers unshaded.
     * Default is `false`.
     */
    elevationLayersOnly?: boolean;
}
