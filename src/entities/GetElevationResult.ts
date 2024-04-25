import type Coordinates from '../core/geographic/Coordinates';
import type ElevationSample from './ElevationSample';

type GetElevationResult = {
    /**
     * The coordinates of the samples.
     */
    coordinates: Coordinates;
    /**
     * The elevation samples.
     */
    samples: ElevationSample[];
};

export default GetElevationResult;
