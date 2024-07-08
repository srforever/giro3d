import type { Color } from 'three';

// See https://www.codeproject.com/Articles/16565/Determining-Ideal-Text-Color-Based-on-Specified-Ba
/**
 * Returns a color that contrasts with the input color.
 */
export function getContrastColor(color: Color): string {
    // Find a text color with enough contrast from the background color
    const nThreshold = 105 / 255;
    const bgDelta = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;

    return 1 - bgDelta < nThreshold ? '#000000' : '#ffffff';
}
