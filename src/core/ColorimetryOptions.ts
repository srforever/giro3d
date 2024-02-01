/**
 * Colorimetry options.
 */
export default interface ColorimetryOptions {
    /**
     * Brightness.
     */
    brightness: number;
    /**
     * Contrast.
     */
    contrast: number;
    /**
     * Saturation.
     */
    saturation: number;
}

export function defaultColorimetryOptions(): ColorimetryOptions {
    return {
        brightness: 0,
        saturation: 1,
        contrast: 1,
    };
}
