import {
    Points,
    type BufferGeometry,
    type EventDispatcher,
    type Vector2,
    type Object3DEventMap,
    type Material,
} from 'three';
import PointsMaterial from '../renderer/PointsMaterial.js';
import type Entity3D from '../entities/Entity3D.js';
import type Extent from './geographic/Extent.js';

export interface PointCloudEventMap extends Object3DEventMap {
    'dispose': { };
}

/** Options for constructing {@link PointCloud} */
export interface PointCloudOptions {
    /** Parent entity */
    layer?: Entity3D,
    /** Geometry */
    geometry?: BufferGeometry,
    /** Material */
    material?: Material,
    /** Texture size */
    textureSize?: Vector2,
}

/**
 * A point cloud object with geospatial properties.
 *
 */
class PointCloud extends Points implements EventDispatcher<PointCloudEventMap> {
    readonly isPointCloud: boolean = true;
    private _layer: Entity3D;
    extent?: Extent;
    textureSize?: Vector2;
    disposed: boolean;
    material: Material;

    constructor({
        layer,
        geometry,
        material = new PointsMaterial(),
        textureSize,
    }: PointCloudOptions) {
        super(geometry, material);
        this._layer = layer;
        this.extent = undefined;
        this.textureSize = textureSize;
        this.disposed = false;
    }

    get layer() {
        return this._layer;
    }
    set layer(value: Entity3D) {
        this._layer = value;
    }

    getExtent() {
        return this.extent;
    }

    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        // @ts-ignore - Points declaration seems broken
        this.dispatchEvent({ type: 'dispose' });
        this.geometry.dispose();
        this.material.dispose();
    }
}

export default PointCloud;
