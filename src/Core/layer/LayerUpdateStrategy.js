/**
 * This modules contains various layer update strategies constants
 *
 * Default strategy is STRATEGY_MIN_NETWORK_TRAFFIC which aims
 * to reduce the amount of network traffic.
 *
 * @module Core/layer/LayerUpdateStrategy
 */

/**
 *
 * Use a strategy to minimize network traffic. This strategy will never download intermediate tiles.
 *
 * @constant
 * @type {number}
 * @default
 * @api
 */
export const STRATEGY_MIN_NETWORK_TRAFFIC = 0;
/**
 * Use "stops" configured in layer.updateStrategy.options to choose which level to download.
 *
 * @constant
 * @type {number}
 * @default
 * @api
 */
export const STRATEGY_GROUP = 1;
/**
 * Always download every intermediate level to refine tiles.
 *
 * @constant
 * @type {number}
 * @default
 * @api
 */
export const STRATEGY_PROGRESSIVE = 2;
/**
 * Use a dichotomy strategy to download tiles. Example: when fetching a lvl 10 tile having the lvl 2
 * texture already, this strategy will download the level 6 (midpoint between 2 and 10), then 8
 * (midpoint between 6 and 10), then 9 then 10.
 *
 * @constant
 * @type {number}
 * @default
 * @api
 */
export const STRATEGY_DICHOTOMY = 3;

export const UPDATE_STRATEGIES = {
    STRATEGY_MIN_NETWORK_TRAFFIC,
    STRATEGY_GROUP,
    STRATEGY_PROGRESSIVE,
    STRATEGY_DICHOTOMY,
};
