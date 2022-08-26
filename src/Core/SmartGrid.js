import { BufferGeometry, Vector3, BufferAttribute } from 'three';

// import OBB from '../Renderer/ThreeExtended/OBB.js';

class SmartGrid extends BufferGeometry {
    constructor(layer, arrayData, dimension) {
        super();

        const { nodata } = layer;

        const { width, height } = arrayData;
        const data = arrayData['0'];

        const wl = width - 1;
        const hl = height - 1;
        const uvStepX = 1 / wl;
        const uvStepY = 1 / hl;
        const rowStep = uvStepX * dimension.x;
        const columnStep = uvStepY * -dimension.y;
        // const rowStep = uvStepX;
        // const columnStep = uvStepY;

        const indicesTable = {};
        const rad2degree = 180 / Math.PI;
        const numVertices = data.filter(x => x !== nodata).length;
        const uvs = new Float32Array(numVertices * 2);
        const normals = new Float32Array(numVertices * 3);
        const positions = new Float32Array(numVertices * 3);
        const indices = new Uint32Array(numVertices * 6);
        const dataValues = new Float32Array(numVertices);

        let i;
        let value;
        let slopes;
        let iPos = 0;
        let uvY = 1.0;
        let posNdx = 0;
        let posY = 0.0;
        let left = data[0];
        let indicesSet;
        let indicesStop = 0;
        let hasLeft = false;
        let thisSet = new Set();
        // let slopesMin = 90;
        // let slopesMax = 0;

        /* if (layer.type === 'elevation') {
            slopes = new Float32Array(numVertices);
        } */

        function calcNormal(previous, next, above, below) {
            return new Vector3(
                (previous - next) / rowStep,
                (above - below) / columnStep,
                2,
            ).normalize();
        }

        /* function slopeFromNormal(norm) {
            const slope = Math.acos(norm.z) * rad2degree;
            if (slope < slopesMin) {
                slopesMin = slope;
            } else if (slope > slopesMax) {
                slopesMax = slope;
            }
            slopes[iPos] = slope;
        } */

        function handleCell(posX, right, above, below) {
            dataValues[iPos] = value;
            indicesTable[i] = iPos;
            thisSet.add(i);
            // if (layer.type === 'elevation') {
            const norm = calcNormal(left, right, above, below);
            // slopeFromNormal(norm);
            positions[posNdx] = posX * rowStep;
            normals[posNdx] = norm.x;
            posNdx += 1;
            positions[posNdx] = posY;
            normals[posNdx] = norm.y;
            posNdx += 1;
            positions[posNdx] = value;
            normals[posNdx] = norm.z;
            posNdx += 1;
            /* } else {
                positions[posNdx] = posX * rowStep;
                normals[posNdx] = 0.0;
                posNdx += 1;
                positions[posNdx] = posY;
                normals[posNdx] = 0.0;
                posNdx += 1;
                positions[posNdx] = 0.0;
                normals[posNdx] = 1.0;
                posNdx += 1;
            } */
            const uvNdx = iPos * 2;
            uvs[uvNdx] = posX * uvStepX;
            uvs[uvNdx + 1] = uvY;
            left = value;
            iPos += 1;
        }

        function indicesLeft(above) {
            if (indicesSet.has(above)) {
                indices.set([indicesTable[above], iPos, indicesTable[above + 1]], indicesStop);
                indicesStop += 3;
            }
        }

        function indicesMiddle(above) {
            const previousAbove = above - 1;
            if (indicesSet.has(above)) {
                if (hasLeft) {
                    indices.set([iPos - 1, iPos, indicesTable[above]], indicesStop);
                    indicesStop += 3;
                } else if (indicesSet.has(previousAbove)) {
                    indices.set(
                        [iPos, indicesTable[above], indicesTable[previousAbove]],
                        indicesStop,
                    );
                    indicesStop += 3;
                }
                const nextAbove = above + 1;
                if (indicesSet.has(nextAbove)) {
                    indices.set([iPos, indicesTable[nextAbove], indicesTable[above]], indicesStop);
                    indicesStop += 3;
                }
            } else if (hasLeft && indicesSet.has(previousAbove)) {
                indices.set([iPos - 1, iPos, indicesTable[previousAbove]], indicesStop);
                indicesStop += 3;
            }
        }

        function indicesRight(above) {
            const previousAbove = above - 1;
            if (indicesSet.has(above)) {
                if (hasLeft) {
                    indices.set([iPos - 1, iPos, indicesTable[above]], indicesStop);
                    indicesStop += 3;
                } else if (indicesSet.has(previousAbove)) {
                    indices.set(
                        [iPos, indicesTable[above], indicesTable[previousAbove]],
                        indicesStop,
                    );
                    indicesStop += 3;
                }
            } else if (hasLeft && indicesSet.has(previousAbove)) {
                indices.set([iPos - 1, iPos, indicesTable[previousAbove]], indicesStop);
                indicesStop += 3;
            }
        }

        // Top border
        //
        //  First cell (left border) and Nexts
        for (i = 0; i < wl; i++) {
            value = data[i];
            if (value !== nodata) {
                handleCell(i, data[i + 1], value, data[i + width]);
            }
        }
        // Last cell (right border)
        i = wl;
        value = data[i];
        if (value !== nodata) {
            handleCell(wl, value, value, data[wl + width]);
        }
        // Next rows
        //
        for (let h = 1; h < hl; h++) {
            const hw = h * width;
            posY = h * columnStep;
            uvY = 1 - h * uvStepY;
            indicesSet = thisSet;
            thisSet = new Set();
            // First cell (left border)
            i = hw;
            value = data[i];
            if (value !== nodata) {
                left = value;
                const above = i - width;
                indicesLeft(above);
                handleCell(0, data[i + 1], data[above], data[i + width]);
                hasLeft = true;
            }
            // Next cells
            for (let w = 1; w < wl; w++) {
                i = hw + w;
                value = data[i];
                if (value !== nodata) {
                    const above = i - width;
                    indicesMiddle(above);
                    handleCell(w, data[i + 1], data[above], data[i + width]);
                    hasLeft = true;
                } else {
                    hasLeft = false;
                }
            }
            // Last cell (right border)
            i = hw + wl;
            value = data[i];
            if (value !== nodata) {
                const above = i - width;
                indicesRight(above);
                handleCell(wl, value, data[above], data[i + width]);
            }
        }
        // Bottom border
        //
        const hw = hl * width;
        posY = hl * columnStep;
        uvY = 1 - hl * uvStepY;
        indicesSet = thisSet;
        thisSet = new Set();
        hasLeft = false;
        // First cell (left border)
        i = hw;
        value = data[i];
        if (value !== nodata) {
            left = value;
            const above = i - width;
            indicesLeft(above);
            handleCell(0, data[i + 1], data[above], value);
            hasLeft = true;
        }
        // Next cells
        for (let w = 1; w < wl; w++) {
            i = hw + w;
            value = data[i];
            if (value !== nodata) {
                const above = i - width;
                indicesMiddle(above);
                handleCell(w, data[i + 1], data[above], value);
                hasLeft = true;
            } else {
                hasLeft = false;
            }
        }
        // Last cell (right border)
        i = hw + wl;
        value = data[i];
        if (value !== nodata) {
            const above = i - width;
            indicesRight(above);
            handleCell(wl, value, data[above], value);
        }

        this.setAttribute('position', new BufferAttribute(positions, 3));
        this.setAttribute('normal', new BufferAttribute(normals, 3));
        this.setAttribute('uv', new BufferAttribute(uvs, 2));
        this.setIndex(new BufferAttribute(indices.slice(0, indicesStop), 1));
        this.translate(
            -width * 0.5 * rowStep,
            -height * 0.5 * columnStep,
            0.0, // -layer.minmax.min,
        );
        this.computeBoundingBox();
        // this.OBB = new OBB(this.boundingBox.min, this.boundingBox.max);
        // console.log(this.OBB);
        // this.scale(dimension.x, -dimension.y, layer.minmax.max - layer.minmax.min);
        
        /* if (layer.type === 'elevation') {
            this.userData.elevations = dataValues;
            this.userData.slopes = slopes;
            layer.object3d.userData.elevationMin = layer.minmax.min;
            layer.object3d.userData.elevationMax = layer.minmax.max;
            const layerSlopesMin = layer.object3d.userData.slopesMin;
            if (layerSlopesMin) {
                layer.object3d.userData.slopesMin = Math.min(layerSlopesMin, slopesMin);
            } else {
                layer.object3d.userData.slopesMin = slopesMin;
            }
            const layerSlopesMax = layer.object3d.userData.slopesMax;
            if (layerSlopesMax) {
                layer.object3d.userData.slopesMax = Math.max(layerSlopesMax, slopesMax);
            } else {
                layer.object3d.userData.slopesMax = slopesMax;
            }
        } else {
            this.userData.intensities = dataValues;
            layer.object3d.userData.intensityMin = layer.minmax.min;
            layer.object3d.userData.intensityMax = layer.minmax.max;
        } */

    }

    /* crop(x1, x2, y1, y2) {
        console.log(x1, x2, y1, y2);
        const newGeom = this.clone();
        const indices = this.index.array;
        const uvs = this.attributes.uv.array;
        const positions = this.attributes.position.array;
        const newUVs = [];
        const newIndices = [];
        const newPositions = [];
        const indicesTable = {};
        const validIndices = new Set();
        for (let i = 0, l = uvs.length / 2; i < l; i++) {
            const i2 = i * 2;
            const uvu = uvs[i2 + 0];
            const uvv = uvs[i2 + 1];
            if (uvu >= x1 && uvu <= x2 && uvv >= y1 && uvv <= y2) {
                validIndices.add(i2);
                indicesTable[i2] = newUVs.length / 2;
                newUVs.push(uvu, uvv);
                newPositions.push(positions[i2 + 0], positions[i2 + 1], positions[i2 + 2]);
            }
        }
        for (let i = 0, l = indices.length / 3; i < l; i += 3) {
            const i1 = indices[i + 0];
            const i2 = indices[i + 1];
            const i3 = indices[i + 2];
            if (validIndices.has(i1) && validIndices.has(i2) && validIndices.has(i3)) {
                newIndices.push(indicesTable[i1], indicesTable[i2], indicesTable[i3]);
            }
        }
        newGeom.setAttribute('position', new BufferAttribute(new Float32Array(newPositions), 3));
        newGeom.setAttribute('uv', new BufferAttribute(new Float32Array(newUVs), 2));
        newGeom.setIndex(new BufferAttribute(new Uint32Array(newIndices), 1));
        // this.setIndex(null);
        newGeom.computeBoundingBox();
        return new BufferGeometry().setFromPoints(newPositions);
    } */
}

export default SmartGrid;
