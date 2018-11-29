import * as THREE from 'three';


const m = new THREE.Matrix4();
const temp = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
];

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
        // Map temp[i] from NDC = [-1, 1] to viewport coordinates
        temp[i].x = (temp[i].x + 1.0) * camera.width * 0.5;
        temp[i].y = camera.height - (temp[i].y + 1.0) * camera.height * 0.5;
    }

    // compute the real area
    const area = Math.abs(THREE.ShapeUtils.area([temp[0], temp[2], temp[3], temp[1]]));

    const result = {
        origin: temp[0].clone(),
        x: temp[1].clone(),
        y: temp[2].clone(),
        lengths: { },
        area
    };
    result.lengths.x = temp[1].sub(temp[0]).length();
    result.lengths.y = temp[2].sub(temp[0]).length();
    if (_3d) {
        result.z = temp[4].clone();
        result.lengths.z = temp[4].sub(temp[0]).length();
    }
    result.ratio = result.area / (result.lengths.x * result.lengths.y);

    return result;
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
        const distance = findBox3Distance(camera, box3, matrix);

        if (distance <= geometricError) {
            return;
        }

        const size = computeSizeFromGeometricError(
            box3, geometricError, mode == this.MODE_3D);
        let offset = box3.min;

        const sse = computeSSE(
            offset, size, matrix,
            camera, mode == this.MODE_3D);

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

    initDebugTool(view) {
        // Should move to a proper debug tool.. later
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.style.top = '0px';
        svg.style.left = '0px';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.position = 'absolute';
        svg.style.pointerEvents = 'none';
        document.getElementById('viewerDiv').appendChild(svg);

        document.addEventListener('click', (evt) => {
          const r = view.tileLayer.pickObjectsAt(view, view.eventToViewCoords(evt), 1);
          if (!r.length) return;
          const obj = r[0].object;
          console.log(obj)

          // const svg = document.getElementsByClassName('maa')[0];
          while (svg.firstChild) {
              svg.removeChild(svg.firstChild);
          }
          function addLine(v1, v2, length, color) {
              const line = document.createElementNS('http://www.w3.org/2000/svg','line');
              line.setAttribute('x1', v1.x.toFixed());
              line.setAttribute('y1', v1.y.toFixed())
              line.setAttribute('x2', v2.x.toFixed())
              line.setAttribute('y2', v2.y.toFixed())
              line.setAttribute('stroke', color);
              svg.append(line);

              const text2 = document.createElementNS('http://www.w3.org/2000/svg','text');
              text2.setAttribute('x', ((v1.x + v2.x) * 0.5).toFixed());
              text2.setAttribute('y', ((v1.y + v2.y) * 0.5 - 10).toFixed());
              text2.setAttribute('stroke', color);
              text2.textContent = length.toFixed();
              svg.append(text2);
          }

          addLine(obj.sse.origin, obj.sse.x, obj.sse.lengths.x, 'yellow');
          addLine(obj.sse.origin, obj.sse.y, obj.sse.lengths.y, 'purple');

          const origin = document.createElementNS('http://www.w3.org/2000/svg','circle');
          origin.setAttribute('cx', obj.sse.origin.x.toFixed());
          origin.setAttribute('cy', obj.sse.origin.y.toFixed())
          origin.setAttribute('r', 5)
          origin.setAttribute('stroke', 'black');
          svg.append(origin);
          const text = document.createElementNS('http://www.w3.org/2000/svg','text');
          text.setAttribute('x', (obj.sse.origin.x + 10).toFixed());
          text.setAttribute('y', (obj.sse.origin.y - 10).toFixed())
          text.textContent = obj.id;

          svg.append(text);
        });
    }
};
