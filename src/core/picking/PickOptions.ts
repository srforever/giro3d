import type PickResult from './PickResult';

/**
 * Filter on picked result.
 *
 * Can be used to filter-out results, especially useful when using the `limit` option.
 * Callback should return `true` to include the result, or `false` to discard it.
 */
export type PickFilterCallback = <T>(result: PickResult<T>) => boolean;

/**
 * Pick options.
 */
interface PickOptions {
    /**
     * Radius (in pixels) for picking (default 0).
     *
     * Picking will happen in a circle centered on the coordinates provided.
     * Radius is the radius of this circle, in pixels.
     *
     * This is honored by all native Giro3D picking methods, but *may not* be
     * honored by customized picking methods.
     *
     * @defaultValue 0
     */
    radius?: number;
    /**
     * Maximum number of objects to return.
     *
     * @defaultValue Infinity
     */
    limit?: number;
    /** Filter on the picked results */
    filter?: PickFilterCallback;
}

export default PickOptions;
