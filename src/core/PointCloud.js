/**
 * @module core/PointCloud
 */
import { Points } from 'three';
import PointsMaterial from '../renderer/PointsMaterial.js';

/**
 * A point cloud object with geospatial properties.
 *
 * @api
 */
class PointCloud extends Points {
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
        this.isPointCloud = true;
    }

    getExtent() {
        return this.extent;
    }
}

export default PointCloud;
