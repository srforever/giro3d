/**
 * @module helpers/OBBHelper
 */
import {
    BufferAttribute,
    BufferGeometry,
    LineBasicMaterial,
    LineSegments,
    Vector3,
} from 'three';

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

/**
 * Displays an Oriented Bounding Box (OBB).
 *
 * @api
 */
class OBBHelper extends LineSegments {
    constructor(OBB, color) {
        const indices = new Uint16Array(
            [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7],
        );
        const positions = new Float32Array(8 * 3);

        const geometry = new BufferGeometry();
        geometry.setIndex(new BufferAttribute(indices, 1));
        geometry.setAttribute('position', new BufferAttribute(positions, 3));

        super(geometry, new LineBasicMaterial({
            color: color.getHex(),
            linewidth: 3,
        }));

        this.type = 'OBBHelper';
        this.isHelper = true;
        this.frustumCulled = false;

        if (OBB !== undefined) { this.update(OBB); }
    }

    dispose() {
        this.material.dispose();
        this.geometry.dispose();
    }

    setMaterialVisibility(show) {
        this.material.visible = show;
        this.textMesh.material.visible = show;
    }

    update(OBB) {
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
    }
}

export default OBBHelper;
