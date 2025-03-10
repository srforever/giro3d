import {
    Box3,
    Frustum,
    MathUtils,
    Matrix4,
    type Sphere,
    type OrthographicCamera,
    PerspectiveCamera,
    Vector3,
} from 'three';
import Coordinates from '../core/geographic/Coordinates';

const ndcBox3 = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));

const tmp = {
    frustum: new Frustum(),
    matrix: new Matrix4(),
    box3: new Box3(),
};

const points = [
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
];

export interface CameraOptions {
    /** the THREE camera to use */
    camera?: PerspectiveCamera;
}

export const DEFAULT_MIN_NEAR_PLANE = 2;
export const DEFAULT_MAX_NEAR_PLANE = 2000000000;

export function isPerspectiveCamera(obj: unknown): obj is PerspectiveCamera {
    return (obj as PerspectiveCamera)?.isPerspectiveCamera;
}

export function isOrthographicCamera(obj: unknown): obj is OrthographicCamera {
    return (obj as OrthographicCamera)?.isOrthographicCamera;
}

/**
 * Adds geospatial capabilities to three.js cameras.
 */
class Camera {
    private _crs: string;
    camera3D: PerspectiveCamera | OrthographicCamera;
    private _viewMatrix: Matrix4;
    width: number;
    height: number;
    private _preSSE: number;
    private _maxFar: number = DEFAULT_MAX_NEAR_PLANE;
    private _minNear: number = DEFAULT_MIN_NEAR_PLANE;

    /**
     * @param crs - the CRS of this camera
     * @param width - the width in pixels of the camera viewport
     * @param height - the height in pixels of the camera viewport
     * @param options - optional values
     */
    constructor(crs: string, width: number, height: number, options: CameraOptions = {}) {
        this._crs = crs;

        this.camera3D = options.camera ? options.camera : new PerspectiveCamera(30, width / height);
        this.camera3D.near = DEFAULT_MIN_NEAR_PLANE;
        this.camera3D.far = DEFAULT_MAX_NEAR_PLANE;
        this.camera3D.updateProjectionMatrix();
        this._viewMatrix = new Matrix4();
        this.width = width;
        this.height = height;

        this._preSSE = Infinity;
    }

    get crs() {
        return this._crs;
    }

    get preSSE() {
        return this._preSSE;
    }
    set preSSE(value) {
        this._preSSE = value;
    }

    get viewMatrix() {
        return this._viewMatrix;
    }

    get near() {
        return this.camera3D.near;
    }

    /**
     * Gets or sets the distance to the near plane. The distance will be clamped to be within
     * the bounds defined by {@link minNearPlane} and {@link maxFarPlane}.
     */
    set near(distance: number) {
        this.camera3D.near = MathUtils.clamp(distance, this.minNearPlane, this.maxFarPlane);
    }

    get far() {
        return this.camera3D.far;
    }

    /**
     * Gets or sets the distance to the far plane. The distance will be clamped to be within
     * the bounds defined by {@link minNearPlane} and {@link maxFarPlane}.
     */
    set far(distance: number) {
        this.camera3D.far = MathUtils.clamp(distance, this.minNearPlane, this.maxFarPlane);
    }

    /**
     * Gets or sets the maximum distance allowed for the camera far plane.
     */
    get maxFarPlane() {
        return this._maxFar;
    }

    set maxFarPlane(distance: number) {
        this._maxFar = distance;
        this.camera3D.far = Math.min(this.camera3D.far, distance);
    }

    /**
     * Gets or sets the minimum distance allowed for the camera near plane.
     */
    get minNearPlane() {
        return this._minNear;
    }

    set minNearPlane(distance: number) {
        this._minNear = distance;
        this.camera3D.near = Math.max(this.camera3D.near, distance);
    }

    /**
     * Resets the near and far planes to their default value.
     */
    resetPlanes() {
        this.near = this.minNearPlane;
        this.far = this.maxFarPlane;
    }

    update(width?: number, height?: number) {
        this._resize(width, height);

        // update matrix
        this.camera3D.updateMatrixWorld();

        // keep our visibility testing matrix ready
        this._viewMatrix.multiplyMatrices(
            this.camera3D.projectionMatrix,
            this.camera3D.matrixWorldInverse,
        );
    }

    private _resize(width?: number, height?: number) {
        if (width && height) {
            this.width = width;
            this.height = height;
            const ratio = width / height;

            if (isPerspectiveCamera(this.camera3D)) {
                if (this.camera3D.aspect !== ratio) {
                    this.camera3D.aspect = ratio;
                }
            } else if (isOrthographicCamera(this.camera3D)) {
                const orthographic = this.camera3D;
                const width = orthographic.right - orthographic.left;
                const height = width / ratio;
                orthographic.top = height / 2;
                orthographic.bottom = -height / 2;
            }
        }

        this.camera3D.updateProjectionMatrix();
    }

    /**
     * Return the position in the requested CRS, or in camera's CRS if undefined.
     *
     * @param crs - if defined (e.g 'EPSG:4236') the camera position will be
     * returned in this CRS
     * @returns Coordinates object holding camera's position
     */
    position(crs?: string) {
        return new Coordinates(this.crs, this.camera3D.position).as(crs || this.crs);
    }

    isBox3Visible(box3: Box3, matrixWorld: Matrix4) {
        return this.box3SizeOnScreen(box3, matrixWorld).intersectsBox(ndcBox3);
    }

    isSphereVisible(sphere: Sphere, matrixWorld: Matrix4) {
        if (matrixWorld) {
            tmp.matrix.multiplyMatrices(this._viewMatrix, matrixWorld);
            tmp.frustum.setFromProjectionMatrix(tmp.matrix);
        } else {
            tmp.frustum.setFromProjectionMatrix(this._viewMatrix);
        }
        return tmp.frustum.intersectsSphere(sphere);
    }

    box3SizeOnScreen(box3: Box3, matrixWorld: Matrix4) {
        const pts = this._projectBox3PointsInCameraSpace(box3, matrixWorld);

        // All points are in front of the near plane -> box3 is invisible
        if (!pts) {
            return tmp.box3.makeEmpty();
        }

        // Project points on screen
        for (let i = 0; i < 8; i++) {
            pts[i].applyMatrix4(this.camera3D.projectionMatrix);
        }

        return tmp.box3.setFromPoints(pts);
    }

    private _projectBox3PointsInCameraSpace(box3: Box3, matrixWorld?: Matrix4) {
        if (!('near' in this.camera3D)) {
            return undefined;
        }

        // Projects points in camera space
        // We don't project directly on screen to avoid artifacts when projecting
        // points behind the near plane.
        let m = this.camera3D.matrixWorldInverse;
        if (matrixWorld) {
            m = tmp.matrix.multiplyMatrices(this.camera3D.matrixWorldInverse, matrixWorld);
        }
        points[0].set(box3.min.x, box3.min.y, box3.min.z).applyMatrix4(m);
        points[1].set(box3.min.x, box3.min.y, box3.max.z).applyMatrix4(m);
        points[2].set(box3.min.x, box3.max.y, box3.min.z).applyMatrix4(m);
        points[3].set(box3.min.x, box3.max.y, box3.max.z).applyMatrix4(m);
        points[4].set(box3.max.x, box3.min.y, box3.min.z).applyMatrix4(m);
        points[5].set(box3.max.x, box3.min.y, box3.max.z).applyMatrix4(m);
        points[6].set(box3.max.x, box3.max.y, box3.min.z).applyMatrix4(m);
        points[7].set(box3.max.x, box3.max.y, box3.max.z).applyMatrix4(m);

        // In camera space objects are along the -Z axis
        // So if min.z is > -near, the object is invisible
        let atLeastOneInFrontOfNearPlane = false;
        for (let i = 0; i < 8; i++) {
            if (points[i].z <= -this.camera3D.near) {
                atLeastOneInFrontOfNearPlane = true;
            } else {
                // Clamp to near plane
                points[i].z = -this.camera3D.near;
            }
        }

        return atLeastOneInFrontOfNearPlane ? points : undefined;
    }
}

export default Camera;
