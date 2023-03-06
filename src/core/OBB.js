import {
    Box3,
    Object3D,
    Vector3,
} from 'three';

class OBB extends Object3D {
    constructor(min, max) {
        super();
        this.type = 'OBB';
        this.isHelper = true;
        this.box3D = new Box3(min.clone(), max.clone());
        this.natBox = this.box3D.clone();
        this.z = { min: 0, max: 0 };
        this.topPointsWorld = [
            new Vector3(),
            new Vector3(),
            new Vector3(),
            new Vector3(),
        ];
        this.update();
    }

    clone() {
        const cOBB = new OBB(this.natBox.min, this.natBox.max);
        cOBB.position.copy(this.position);
        cOBB.quaternion.copy(this.quaternion);
        return cOBB;
    }

    updateMinMax(min, max) {
        this.box3D.min.copy(min);
        this.box3D.max.copy(max);
        this.natBox.copy(this.box3D);
        this.update();
        this.oPosition.copy(this.position);
    }

    update() {
        this.updateMatrixWorld(true);
        this._cPointsWorld(this._points(this.topPointsWorld));
    }

    updateZ(min, max) {
        this.z = { min, max };
        this.box3D.min.z = this.natBox.min.z + min;
        this.box3D.max.z = this.natBox.max.z + max;
        this.update();
    }

    _points(points) {
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
    }

    _cPointsWorld(points) {
        const m = this.matrixWorld;

        for (let i = 0, max = points.length; i < max; i++) {
            points[i].applyMatrix4(m);
        }

        return points;
    }
}
export default OBB;
