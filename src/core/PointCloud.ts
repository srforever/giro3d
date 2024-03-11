import {
    Points,
    type BufferGeometry,
    type EventDispatcher,
    type Vector2,
    type Object3DEventMap,
    type Material,
} from 'three';
import PointCloudMaterial from '../renderer/PointCloudMaterial';
import type Entity3D from '../entities/Entity3D.js';
import type Extent from './geographic/Extent.js';
import type Disposable from './Disposable';

export interface PointCloudEventMap extends Object3DEventMap {
    'dispose': { /** empty */ };
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
class PointCloud extends Points implements EventDispatcher<PointCloudEventMap>, Disposable {
    readonly isPointCloud: boolean = true;
    private _layer: Entity3D;
    extent?: Extent;
    textureSize?: Vector2;
    disposed: boolean;
    material: Material;

    constructor({
        layer,
        geometry,
        material = new PointCloudMaterial(),
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

    // eslint-disable-next-line class-methods-use-this
    canProcessColorLayer(): boolean {
        return true;
    }

    getExtent() {
        return this.extent;
    }

    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        // @ts-expect-error Points does not transmit proper event map to parent
        this.dispatchEvent({ type: 'dispose' });
        this.geometry.dispose();
        this.material.dispose();
    }
}

export default PointCloud;
