import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

import OBB from '../Renderer/ThreeExtended/OBB.js';

class TileGeometry extends BufferGeometry {
    constructor(params) {
        super();

        this.extent = params.extent;
        this.center = new Vector3(...this.extent.center()._values);

        this.computeBuffers(params.segment);

        this.computeBoundingBox();
        this.OBB = new OBB(this.boundingBox.min, this.boundingBox.max);
    }

    computeBuffers(nSeg) {
        // segments count :
        // Tile : (nSeg + 1) * (nSeg + 1)
        const nVertex = (nSeg + 1) * (nSeg + 1);
        const triangles = nSeg * nSeg * 2;

        const dimension = this.extent.dimensions();

        const nSegp = nSeg + 1;
        const wl = nSeg;
        const hl = nSeg;
        const uvStepX = 1 / wl;
        const uvStepY = 1 / hl;
        const rowStep = uvStepX * dimension.x;
        const columnStep = uvStepY * -dimension.y;
        const translateX = -nSeg * 0.5 * rowStep;
        const translateY = -nSeg * 0.5 * columnStep;

        const uvs = new Float32Array(nVertex * 2);
        const indices = new Uint32Array(triangles * 3);
        const positions = new Float32Array(nVertex * 3);

        let i;
        let iPos = 0;
        let uvY = 1.0;
        let posNdx = 0;
        let posY = 0.0;
        let indicesStop = 0;

        function handleCell(posX) {
            positions[posNdx] = posX * rowStep + translateX;
            posNdx += 1;
            positions[posNdx] = posY + translateY;
            posNdx += 1;
            positions[posNdx] = 0.0;
            posNdx += 1;
            const uvNdx = iPos * 2;
            uvs[uvNdx] = posX * uvStepX;
            uvs[uvNdx + 1] = uvY;
            iPos += 1;
        }

        function indicesSimple() {
            const above = i - nSegp;
            const previousPos = iPos - 1;
            const previousAbove = above - 1;
            indices[indicesStop + 0] = above;
            indices[indicesStop + 1] = previousPos;
            indices[indicesStop + 2] = iPos;
            indices[indicesStop + 3] = above;
            indices[indicesStop + 4] = previousAbove;
            indices[indicesStop + 5] = previousPos;
            indicesStop += 6;
        }

        // Top border
        //
        for (i = 0; i <= wl; i++) {
            handleCell(i);
        }
        // Next rows
        //
        for (let h = 1; h < hl; h++) {
            const hw = h * nSegp;
            posY = h * columnStep;
            uvY = 1 - h * uvStepY;
            // First cell (left border)
            i = hw;
            handleCell(0);
            // Next cells
            for (let w = 1; w < wl; w++) {
                i = hw + w;
                indicesSimple();
                handleCell(w);
            }
            // Last cell (right border)
            i = hw + wl;
            indicesSimple();
            handleCell(wl);
        }
        // Bottom border
        //
        const hw = hl * nSegp;
        posY = hl * columnStep;
        uvY = 1 - hl * uvStepY;
        // First cell (left border)
        i = hw;
        handleCell(0);
        // Next cells
        for (let w = 1; w < wl; w++) {
            i = hw + w;
            indicesSimple();
            handleCell(w);
        }
        // Last cell (right border)
        i = hw + wl;
        indicesSimple();
        handleCell(wl);

        this.setAttribute('uv', new BufferAttribute(uvs, 2));
        this.setAttribute('position', new BufferAttribute(positions, 3));
        this.setIndex(new BufferAttribute(indices.slice(0, indicesStop), 1));
    }
}

export default TileGeometry;
