/**
 * @module core/PointCloud
 */
import { Points } from 'three';
import PointsMaterial from '../renderer/PointsMaterial.js';

/**
 * A point cloud object with geospatial properties.
 *
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
        this.disposed = false;
    }

    getExtent() {
        return this.extent;
    }

    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.dispatchEvent({ type: 'dispose' });
        this.geometry.dispose();
        this.material.dispose();
    }
}

export default PointCloud;
