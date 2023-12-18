import Extent from '../core/geographic/Extent';
import type { ImageResponse } from './ImageSource';
import ImageSource from './ImageSource';

/**
 * An image source that produces nothing. Mainly for debugging/testing purposes.
 */
class NullSource extends ImageSource {
    readonly isNullSource: boolean = true;
    private readonly _extent: Extent;

    constructor(options : { extent?: Extent } = {}) {
        super();

        this.isNullSource = true;
        this.type = 'NullSource';

        this._extent = options?.extent ?? new Extent('EPSG:3857', 0, 10, 0, 10);
    }

    getCrs() {
        return this._extent.crs();
    }

    // eslint-disable-next-line class-methods-use-this
    getImages(): ImageResponse[] {
        return [];
    }

    getExtent() {
        return this._extent;
    }
}

export default NullSource;
