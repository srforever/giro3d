import {
    Matrix4,
    Vector3,
    ShapeUtils,
    Box3,
} from 'three';

const m = new Matrix4();
const tmpBox3 = new Box3();
const temp = [
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
];

function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

function computeSSE(offset, size, matrix, camera, _3d) {
    temp[0].copy(offset);
    temp[0].applyMatrix4(matrix);

    matrix.extractBasis(temp[1], temp[2], temp[3]);
    // x-axis
    temp[1].normalize().multiplyScalar(size.x);
    // y-axis
    temp[2].normalize().multiplyScalar(size.y);
    // diag-axis
    temp[3] = temp[1].clone().add(temp[2]);
    // z-axis
    if (_3d) {
        temp[4].normalize().multiplyScalar(size.z);
    }

    for (let i = 1; i < (_3d ? 5 : 4); i++) {
        temp[i].add(temp[0]);
    }
    const worldToNDC = camera._viewMatrix;
    for (let i = 0; i < (_3d ? 5 : 4); i++) {
        temp[i].applyMatrix4(worldToNDC);
        temp[i].z = 0;
        // temp[i].clampScalar(-1, 1);
        // Map temp[i] from NDC = [-1, 1] to canvas coordinates
        temp[i].x = (temp[i].x + 1.0) * camera.width * 0.5;
        temp[i].y = camera.height - (temp[i].y + 1.0) * camera.height * 0.5;
    }

    // compute the real area
    const area = Math.abs(ShapeUtils.area([temp[0], temp[2], temp[3], temp[1]]));

    const result = {
        origin: temp[0].clone(),
        x: temp[1].clone(),
        y: temp[2].clone(),
        lengths: { },
        area,
    };
    result.lengths.x = temp[1].sub(temp[0]).length();
    result.lengths.y = temp[2].sub(temp[0]).length();
    if (_3d) {
        result.z = temp[4].clone();
        result.lengths.z = temp[4].sub(temp[0]).length();
    }
    result.ratio = easeInOutQuad(result.area / (result.lengths.x * result.lengths.y));

    return result;
}

function findBox3Distance(camera, box3, matrix, _3d) {
    // TODO: can be cached
    // TODO: what about matrix scale component
    m.copy(matrix).invert();
    // Move camera position in box3 basis
    // (we don't transform box3 to camera basis because box3 are AABB,
    // so instead we apply the inverse transformation to the camera)
    const pt = new Vector3(0, 0, 0)
        .applyMatrix4(camera.camera3D.matrixWorld)
        .applyMatrix4(m);
    // Compute distance between the camera / box3
    tmpBox3.copy(box3);
    if (!_3d) {
        const avgZ = (box3.min.z + box3.max.z) / 2;
        // this is to avoid degenerated box3. If not, the z size is 0, which will break codes that
        // divide by size
        tmpBox3.min.z = avgZ - 0.1;
        tmpBox3.max.z = avgZ + 0.1;
    }
    return tmpBox3.distanceToPoint(pt);
}

function computeSizeFromGeometricError(box3, geometricError, _3d) {
    const size = box3.getSize(temp[5]);
    let maxComponent = Math.max(size.x, size.y);
    if (_3d) {
        maxComponent = Math.max(maxComponent, size.z);
    }
    // Build a vector with the same ratio than box3,
    // and with the biggest component being geometricError
    size.multiplyScalar(geometricError / maxComponent);
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

    //
    // Compute a "visible" error: project geometricError in meter on screen,
    // based on a bounding box and a transformation matrix.
    computeFromBox3(camera, box3, matrix, geometricError, mode) {
        // If the camera is orthographic, there is no need to do this check.
        if (!camera.camera3D.isOrthographicCamera) {
            const distance = findBox3Distance(camera, box3, matrix, mode === this.MODE_3D);
            if (distance <= geometricError) {
                return null;
            }
        }

        const size = computeSizeFromGeometricError(
            box3, geometricError, mode === this.MODE_3D,
        );
        const offset = box3.min;

        const sse = computeSSE(
            offset, size, matrix,
            camera, mode === this.MODE_3D,
        );

        return sse;
    },

    computeFromSphere(camera, sphere, matrix, geometricError) {
        const s = sphere.clone().applyMatrix4(matrix);
        const distance = Math.max(0.0, s.distanceToPoint(camera.camera3D.position));
        temp[0].set(geometricError, 0, -distance);
        temp[0].applyMatrix4(camera.camera3D.projectionMatrix);
        temp[0].x = temp[0].x * camera.width * 0.5;
        temp[0].y = temp[0].y * camera.height * 0.5;
        temp[0].z = 0;

        return temp[0].length();
    },
};
