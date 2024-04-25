import type Map from './Map';

/**
 * Contains information about an elevation sample taken on a map.
 */
type ElevationSample = {
    /**
     * The map on which the sample was done.
     */
    // eslint-disable-next-line no-use-before-define
    map: Map;
    /**
     * The elevation at the sample location.
     */
    elevation: number;
    /**
     * The resolution of the elevation raster this sample was taken from.
     */
    resolution: number;
};

export default ElevationSample;
