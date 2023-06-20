/**
 * @module core/Points
 */
import { Points as ThreePoints } from 'three';
import PointsMaterial from '../renderer/PointsMaterial.js';

/**
 * A point cloud object with geospatial properties.
 *
 * @api
 */
class Points extends ThreePoints {
    constructor({
        layer,
        geometry,
        material = new PointsMaterial(),
        textureSize,
    }) {
        super(geometry, material);
        this._layer = layer;
        this.extent = undefined;
        this.textureSize = textureSize;
    }

    getExtent() {
        return this.extent;
    }
}

export default Points;
