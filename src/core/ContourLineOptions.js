/** @module core/ContourLineOptions */

import { Color } from 'three';

/**
 * @api
 * @typedef {object} ContourLineOptions
 * @property {boolean} [enabled=false] Enables contour lines.
 * @property {number} [interval=100] The vertical interval between each primary line.
 * @property {number} [secondaryInterval=20] The vertical interval between each secondary line.
 * If undefined, secondary lines are not displayed.
 * @property {number} [opacity=1] The opacity of the contour lines (0 = transparent, 1 = opaque).
 * @property {Color} [color] The contour line color. Default is black.
 */
