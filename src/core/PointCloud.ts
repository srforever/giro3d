import {
    Points,
    type BufferGeometry,
    type EventDispatcher,
    type Vector2,
    type Object3DEventMap,
    type Material,
} from 'three';
import PointCloudMaterial from '../renderer/PointCloudMaterial';
import type Extent from './geographic/Extent.js';
import type Disposable from './Disposable';

export interface PointCloudEventMap extends Object3DEventMap {
    'visibility-changed': {
        /** empty */
    };
    dispose: {
        /** empty */
    };
}

/** Options for constructing {@link PointCloud} */
export interface PointCloudOptions {
    /** Geometry */
    geometry?: BufferGeometry;
    /** Material */
    material?: Material;
    /** Texture size */
    textureSize?: Vector2;
}

/**
 * A point cloud object with geospatial properties.
 *
 */
class PointCloud extends Points implements EventDispatcher<PointCloudEventMap>, Disposable {
    readonly isPointCloud: boolean = true;
    readonly type = 'PointCloud';
    extent?: Extent;
    textureSize?: Vector2;
    disposed: boolean;
    material: Material;

    static isPointCloud(obj: unknown): obj is PointCloud {
        return (obj as PointCloud)?.isPointCloud;
    }

    get level(): number {
        if (PointCloud.isPointCloud(this.parent)) {
            return this.parent.level + 1;
        } else {
            return 0;
        }
    }

    constructor({ geometry, material = new PointCloudMaterial(), textureSize }: PointCloudOptions) {
        super(geometry, material);
        this.extent = undefined;
        this.textureSize = textureSize;
        this.disposed = false;

        if (PointCloudMaterial.isPointCloudMaterial(this.material)) {
            this.material.enableClassification = this.geometry.hasAttribute('classification');
        }
    }

    private getPointValue(pointIndex: number, attribute: string): number | undefined {
        if (this.geometry.hasAttribute(attribute)) {
            const buffer = this.geometry.getAttribute(attribute).array;

            return buffer[pointIndex];
        }

        return undefined;
    }

    /**
     * Returns the classification number of the specified point.
     *
     * @param pointIndex - The index of the point.
     * @returns The classification number for the specified point, or `undefined` if this point cloud does not support classifications.
     */
    getClassification(pointIndex: number): number | undefined {
        return this.getPointValue(pointIndex, 'classification');
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
