import * as THREE from 'three';

const v = new THREE.Vector3();
const m = new THREE.Matrix4();
const localToNDC = new THREE.Matrix4();
const modelViewMatrix = new THREE.Matrix4();
const temp = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
];

function computeSSE(offset, size, matrix, camera, _3d) {
    temp[0].copy(offset);
    temp[1].set(size.x, 0, 0).add(offset);
    temp[2].set(0, size.y, 0).add(offset);
    if (_3d) {
        temp[3].set(0, 0, size.z).add(offset);
    }

    localToNDC.multiplyMatrices(camera._viewMatrix, matrix);
    for (let i = 0; i < (_3d ? 4 : 3); i++) {
        temp[i].applyMatrix4(localToNDC);
        temp[i].z = 0;
        // Map temp[i] from NDC = [-1, 1] to viewport coordinates
        temp[i].x = (temp[i].x + 1.0) * camera.width * 0.5;
        temp[i].y = camera.height - (temp[i].y + 1.0) * camera.height * 0.5;
    }

    const res = [];
    for (let i = 0; i < 4; i++) {
        res.push(temp[i].clone());
    }
    return res;

    return basis.map(b => b.length());
}

function findBox3Distance(camera, box3, matrix) {
    // TODO: can be cached
    // TODO: what about matrix scale component
    m.getInverse(matrix);
    // Move camera position in box3 basis
    // (we don't transform box3 to camera basis because box3 are AABB,
    // so instead we apply the inverse transformation to the camera)
    const pt = new THREE.Vector3(0, 0, 0)
        .applyMatrix4(camera.camera3D.matrixWorld)
        .applyMatrix4(m);
    // Compute distance between the camera / box3
    return box3.distanceToPoint(pt);
}

function computeSizeFromGeometricError(box3, geometricError) {
    const size = box3.getSize();
    // Build a vector with the same ratio than box3,
    // and with the biggest component being geometricError
    size.multiplyScalar(geometricError /
        Math.max(size.x, Math.max(size.y, size.z)));
    return size;
}

export default {
    /*
     * Compute SSE based on the 2D bounding-box (ignore z size)
     */
    MODE_2D: 1,

    /*
     * Compute SSE based on the 3D bounding-box
     */
    MODE_3D: 2,

    /**
     * Compute a "visible" error: project geometricError in meter on screen,
     * based on a bounding box and a transformation matrix.
     */
    computeFromBox3(camera, box3, matrix, geometricError, mode) {
        const distance = findBox3Distance(camera, box3, matrix);

        if (distance <= geometricError) {
            return {
                sse: [Infinity, Infinity, Infinity],
                distance,
            };
        }

        const size = computeSizeFromGeometricError(box3, geometricError);

        let offset = box3.min;
        if (mode == this.MODE_2D) {
            offset = offset.clone().setComponent(2, 0);
        }
        const sse = computeSSE(
            offset, size, matrix,
            camera, mode == this.MODE_3D);

        return {
            sse,
            distance,
            size,
        };
    },

    computeFromSphere(camera, sphere, matrix, geometricError) {
        const s = sphere.clone().applyMatrix4(matrix);
        const distance = Math.max(0.0, s.distanceToPoint(camera.camera3D.position));
        basis[0].set(geometricError, 0, -distance);
        basis[0].applyMatrix4(camera.camera3D.projectionMatrix);
        basis[0].x = basis[0].x * camera.width * 0.5;
        basis[0].y = basis[0].y * camera.height * 0.5;
        basis[0].z = 0;

        return basis[0].length();
    },
};
