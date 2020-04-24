/**
 * Wrapper around three.js camera to expose some geographic helpers.
 */

import * as THREE from 'three';
import Coordinates from '../Core/Geographic/Coordinates.js';

function Camera(crs, width, height, options = {}) {
    Object.defineProperty(this, 'crs', { get: () => crs });

    this.camera3D = options.camera ? options.camera : new THREE.PerspectiveCamera(30, width / height);
    this.camera3D.near = 0.1;
    this.camera3D.far = 2000000000;
    this.camera3D.updateProjectionMatrix();
    this.camera2D = new THREE.OrthographicCamera(0, 1, 0, 1, 0, 10);
    this._viewMatrix = new THREE.Matrix4();
    this.width = width;
    this.height = height;

    this._preSSE = Infinity;
}

function resize(camera, width, height) {
    if (width && height) {
        camera.width = width;
        camera.height = height;
        const ratio = width / height;

        if (camera.camera3D.aspect !== ratio) {
            camera.camera3D.aspect = ratio;
            if (camera.camera3D.isOrthographicCamera) {
                const halfH = (camera.camera3D.right - camera.camera3D.left) * 0.5 / ratio;
                const y = (camera.camera3D.top + camera.camera3D.bottom) * 0.5;
                camera.camera3D.top = y + halfH;
                camera.camera3D.bottom = y - halfH;
            }
        }
    }

    if (camera.camera3D.updateProjectionMatrix) {
        camera.camera3D.updateProjectionMatrix();
    }

    camera.camera2D.right = width;
    camera.camera2D.top = height;
    camera.camera2D.bottom = 0;
    camera.camera2D.updateProjectionMatrix();
}

Camera.prototype.update = function update(width, height) {
    resize(this, width, height);

    // update matrix
    this.camera3D.updateMatrixWorld();

    // keep our visibility testing matrix ready
    this._viewMatrix.multiplyMatrices(this.camera3D.projectionMatrix, this.camera3D.matrixWorldInverse);
};

/**
 * Return the position in the requested CRS, or in camera's CRS if undefined.
 * @param {string} crs if defined (e.g 'EPSG:4236') the camera position will be returned in this CRS
 * @return {Coordinates} Coordinates object holding camera's position
 */
Camera.prototype.position = function position(crs) {
    return new Coordinates(this.crs, this.camera3D.position).as(crs || this.crs);
};

const tmp = {
    frustum: new THREE.Frustum(),
    matrix: new THREE.Matrix4(),
    box3: new THREE.Box3(),
};

const points = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
];

function projectBox3PointsInCameraSpace(camera, box3, matrixWorld) {
    // Projects points in camera space
    // We don't project directly on screen to avoid artifacts when projecting
    // points behind the near plane.
    let m = camera.camera3D.matrixWorldInverse;
    if (matrixWorld) {
        m = tmp.matrix.multiplyMatrices(camera.camera3D.matrixWorldInverse, matrixWorld);
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
        if (points[i].z <= -camera.camera3D.near) {
            atLeastOneInFrontOfNearPlane = true;
        } else {
            // Clamp to near plane
            points[i].z = -camera.camera3D.near;
        }
    }

    return atLeastOneInFrontOfNearPlane ? points : undefined;
}

const ndcBox3 = new THREE.Box3(
    new THREE.Vector3(-1, -1, -1),
    new THREE.Vector3(1, 1, 1));

Camera.prototype.isBox3Visible = function isBox3Visible(box3, matrixWorld) {
    return this.box3SizeOnScreen(box3, matrixWorld).intersectsBox(ndcBox3);
};

Camera.prototype.isSphereVisible = function isSphereVisible(sphere, matrixWorld) {
    if (matrixWorld) {
        tmp.matrix.multiplyMatrices(this._viewMatrix, matrixWorld);
        tmp.frustum.setFromMatrix(tmp.matrix);
    } else {
        tmp.frustum.setFromMatrix(this._viewMatrix);
    }
    return tmp.frustum.intersectsSphere(sphere);
};

Camera.prototype.box3SizeOnScreen = function box3SizeOnScreen(box3, matrixWorld) {
    const pts = projectBox3PointsInCameraSpace(this, box3, matrixWorld);

    // All points are in front of the near plane -> box3 is invisible
    if (!pts) {
        return tmp.box3.makeEmpty();
    }

    // Project points on screen
    for (let i = 0; i < 8; i++) {
        pts[i].applyMatrix4(this.camera3D.projectionMatrix);
    }

    return tmp.box3.setFromPoints(pts);
};

export default Camera;
