import {
    Points,
    type BufferGeometry,
    type EventDispatcher,
    type Material,
    type Vector2,
    type Object3DEventMap,
} from 'three';
import PointsMaterial from '../renderer/PointsMaterial.js';
import type Entity from '../entities/Entity.js';
import type Extent from './geographic/Extent.js';

export interface PointCloudEventMap extends Object3DEventMap {
    'dispose': { };
}

export interface PointCloudOptions {
    layer: Entity,
    geometry: BufferGeometry,
    material?: Material | Material[],
    textureSize: Vector2,
}

/**
 * A point cloud object with geospatial properties.
 *
 */
class PointCloud extends Points implements EventDispatcher<PointCloudEventMap> {
    readonly isPointClound: boolean = true;
    private _layer: Entity;
    extent?: Extent;
    textureSize?: Vector2;
    disposed: boolean;
    material: PointsMaterial;

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
