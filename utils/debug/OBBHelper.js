import {
    BufferAttribute,
    BufferGeometry,
    Color,
    DoubleSide,
    LineBasicMaterial,
    LineSegments,
    Mesh,
    MeshBasicMaterial,
    Vector3,
} from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';

// TODO regler le probleme glsl
import fontJS from './fonts/optimer_regular.json';

const font = new Font(fontJS);
const tmpVec3 = new Vector3();
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

class OBBHelper extends LineSegments {
    constructor(OBB, text) {
        const indices = new Uint16Array(
            [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7],
        );
        const positions = new Float32Array(8 * 3);

        const geometry = new BufferGeometry();
        geometry.setIndex(new BufferAttribute(indices, 1));
        geometry.setAttribute('position', new BufferAttribute(positions, 3));

        const color = new Color(Math.random(), Math.random(), Math.random());

        super(geometry, new LineBasicMaterial({
            color: color.getHex(),
            linewidth: 3,
        }));

        this.frustumCulled = false;

        const size = OBB.box3D.getSize(tmpVec3);

        const geometryText = new TextGeometry(text, {

            font,
            size: size.x * 0.0666,
            height: size.z * 0.001,
            curveSegments: 1,

        });

        this.textMesh = new Mesh(geometryText, new MeshBasicMaterial({
            color: new Color(1, 0, 0),
            side: DoubleSide,
        }));

        this.add(this.textMesh);
        this.textMesh.frustumCulled = false;

        if (OBB !== undefined) { this.update(OBB); }
    }

    setMaterialVisibility(show) {
        this.material.visible = show;
        this.textMesh.material.visible = show;
    }

    dispose() {
        this.material.dispose();
        this.geometry.dispose();
        if (this.textMesh) {
            this.textMesh.material.dispose();
            this.textMesh.geometry.dispose();
            delete this.textMesh;
        }
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

        const size = OBB.box3D.getSize(tmpVec3);

        if (this.textMesh) {
            this.textMesh.position.set(0, 0, 0);
            this.textMesh.translateX(-size.x * 0.45);
            this.textMesh.translateY(-size.y * 0.45);
            this.textMesh.translateZ(size.z * 0.1);
        }
    }
}

export default OBBHelper;
