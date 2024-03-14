import type {
    Sphere,
} from 'three';
import {
    Box3,
    Frustum,
    Matrix4,
    OrthographicCamera,
    PerspectiveCamera,
    Vector3,
} from 'three';
import Coordinates from '../core/geographic/Coordinates';

const ndcBox3 = new Box3(
    new Vector3(-1, -1, -1),
    new Vector3(1, 1, 1),
);

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

/**
 * Adds geospatial capabilities to three.js cameras.
 *
 * @param crs - the CRS of this camera
 * @param width - the width in pixels of the camera viewport
 * @param height - the height in pixels of the camera viewport
 * @param options - optional values
 */
class Camera {
    private _crs: string;
    camera3D: PerspectiveCamera;
    camera2D: OrthographicCamera;
    private _viewMatrix: Matrix4;
    width: number;
    height: number;
    private _preSSE: number;

    constructor(crs: string, width: number, height: number, options: CameraOptions = {}) {
        this._crs = crs;

        this.camera3D = options.camera
            ? options.camera : new PerspectiveCamera(30, width / height);
        this.camera3D.near = 0.1;
        this.camera3D.far = 2000000000;
        this.camera3D.updateProjectionMatrix();
        this.camera2D = new OrthographicCamera(0, 1, 0, 1, 0, 10);
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

    update(width?: number, height?: number) {
        this._resize(width, height);

        // update matrix
        this.camera3D.updateMatrixWorld();

        // keep our visibility testing matrix ready
        this._viewMatrix.multiplyMatrices(
            this.camera3D.projectionMatrix, this.camera3D.matrixWorldInverse,
        );
    }

    private _resize(width?: number, height?: number) {
        if (width && height) {
            this.width = width;
            this.height = height;
            const ratio = width / height;

            if (this.camera3D.aspect !== ratio) {
                this.camera3D.aspect = ratio;
            }
        }

        this.camera3D.updateProjectionMatrix();

        this.camera2D.right = width;
        this.camera2D.top = height;
        this.camera2D.bottom = 0;
        this.camera2D.updateProjectionMatrix();
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
        if (!('near' in this.camera3D)) { return undefined; }

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
