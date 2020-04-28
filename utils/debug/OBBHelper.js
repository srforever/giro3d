import * as THREE from 'three';

// TODO regler le probleme glsl
import fontJS from './fonts/optimer_regular.json';

const font = new THREE.Font(fontJS);
const tmpVec3 = new THREE.Vector3();

function OBBHelper(OBB, text) {
    const indices = new Uint16Array(
        [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7],
    );
    const positions = new Float32Array(8 * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const color = new THREE.Color(Math.random(), Math.random(), Math.random());

    THREE.LineSegments.call(this, geometry, new THREE.LineBasicMaterial({
        color: color.getHex(),
        linewidth: 3,
    }));

    this.frustumCulled = false;

    const size = OBB.box3D.getSize(tmpVec3);

    const geometryText = new THREE.TextGeometry(text, {

        font,
        size: size.x * 0.0666,
        height: size.z * 0.001,
        curveSegments: 1,

    });

    this.textMesh = new THREE.Mesh(geometryText, new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 0, 0),
        side: THREE.DoubleSide,
    }));

    this.add(this.textMesh);
    this.textMesh.frustumCulled = false;

    if (OBB !== undefined) { this.update(OBB); }
}

OBBHelper.prototype = Object.create(THREE.LineSegments.prototype);
OBBHelper.prototype.constructor = OBBHelper;

OBBHelper.prototype.setMaterialVisibility = function setMaterialVisibility(show) {
    this.material.visible = show;
    this.textMesh.material.visible = show;
};

OBBHelper.prototype.dispose = function removeChildren() {
    this.material.dispose();
    this.geometry.dispose();
    if (this.textMesh) {
        this.textMesh.material.dispose();
        this.textMesh.geometry.dispose();
        delete this.textMesh;
    }
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

OBBHelper.prototype.update = function update(OBB) {
    const { position } = this.geometry.attributes;
    const { array } = position;

    OBB._points(points);
    let offset = 0;
    for (const pt of points) {
        pt.toArray(array, offset);
        offset += 3;
    }

    position.needsUpdate = true;

    this.updateMatrix();
    this.updateMatrixWorld(true);

    const size = OBB.box3D.getSize(tmpVec3);

    if (this.textMesh) {
        this.textMesh.position.set(0, 0, 0);
        this.textMesh.translateX(-size.x * 0.45);
        this.textMesh.translateY(-size.y * 0.45);
        this.textMesh.translateZ(size.z * 0.1);
    }
};

export default OBBHelper;
