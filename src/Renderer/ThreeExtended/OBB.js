import * as THREE from 'three';

function OBB(min, max) {
    THREE.Object3D.call(this);
    this.box3D = new THREE.Box3(min.clone(), max.clone());
    this.natBox = this.box3D.clone();
    this.z = { min: 0, max: 0 };
    this.topPointsWorld = [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
    ];
    this.update();
}

OBB.prototype = Object.create(THREE.Object3D.prototype);
OBB.prototype.constructor = OBB;

OBB.prototype.clone = function clone() {
    const cOBB = new OBB(this.natBox.min, this.natBox.max);
    cOBB.position.copy(this.position);
    cOBB.quaternion.copy(this.quaternion);
    return cOBB;
};

OBB.prototype.update = function update() {
    this.updateMatrixWorld(true);
    this._cPointsWorld(this._points(this.topPointsWorld));
};

OBB.prototype.updateZ = function updateZ(min, max) {
    this.z = { min, max };
    this.box3D.min.z = this.natBox.min.z + min;
    this.box3D.max.z = this.natBox.max.z + max;
    this.update();
};

OBB.prototype._points = function _points(points) {
    // top points of bounding box
    points[0].set(this.box3D.max.x, this.box3D.max.y, this.box3D.max.z);
    points[1].set(this.box3D.min.x, this.box3D.max.y, this.box3D.max.z);
    points[2].set(this.box3D.min.x, this.box3D.min.y, this.box3D.max.z);
    points[3].set(this.box3D.max.x, this.box3D.min.y, this.box3D.max.z);
    // bottom points of bounding box
    if (points.length > 4) {
        points[4].set(this.box3D.max.x, this.box3D.max.y, this.box3D.min.z);
        points[5].set(this.box3D.min.x, this.box3D.max.y, this.box3D.min.z);
        points[6].set(this.box3D.min.x, this.box3D.min.y, this.box3D.min.z);
        points[7].set(this.box3D.max.x, this.box3D.min.y, this.box3D.min.z);
    }

    return points;
};

OBB.prototype._cPointsWorld = function _cPointsWorld(points) {
    var m = this.matrixWorld;

    for (var i = 0, max = points.length; i < max; i++) {
        points[i].applyMatrix4(m);
    }

    return points;
};

export default OBB;
