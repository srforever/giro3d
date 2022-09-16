import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

import OBB from '../Renderer/ThreeExtended/OBB.js';

function Buffers() {
    this.index = null;
    this.position = null;
    this.uv = null;
}

// Define UV computation functions if needed
function UV_WGS84(out, id, u, v) {
    out.uv.array[id * 2 + 0] = u;
    out.uv.array[id * 2 + 1] = v;
}

function bufferize(outBuffers, va, vb, vc, idVertex) {
    outBuffers.index.array[idVertex + 0] = va;
    outBuffers.index.array[idVertex + 1] = vb;
    outBuffers.index.array[idVertex + 2] = vc;
    return idVertex + 3;
}

class TileGeometry extends BufferGeometry {
    constructor(params) {
        super();

        this.center = new Vector3(...params.extent.center()._values);
        this.extent = params.extent;

        const bufferAttribs = this.computeBuffers(params);

        this.setIndex(bufferAttribs.index);
        this.setAttribute('position', bufferAttribs.position);
        this.setAttribute('uv', bufferAttribs.uv);

        this.computeBoundingBox();
        this.OBB = new OBB(this.boundingBox.min, this.boundingBox.max);
    }

    computeBuffers(params) {
        // Create output buffers.
        const outBuffers = new Buffers();

        const nSeg = params.segment;
        // segments count :
        // Tile : (nSeg + 1) * (nSeg + 1)
        const nVertex = (nSeg + 1) * (nSeg + 1);
        const triangles = (nSeg) * (nSeg) * 2;

        outBuffers.position = new BufferAttribute(new Float32Array(nVertex * 3), 3);
        outBuffers.index = new BufferAttribute(
            new Uint32Array(triangles * 3), 1,
        );
        outBuffers.uv = new BufferAttribute(
            new Float32Array(nVertex * 2), 2,
        );

        const widthSegments = Math.max(2, Math.floor(nSeg) || 2);
        const heightSegments = Math.max(2, Math.floor(nSeg) || 2);

        let idVertex = 0;
        const vertices = [];

        params.nbRow = 2.0 ** (params.zoom + 1.0);
        params.projected = new Vector3();

        for (let y = 0; y <= heightSegments; y++) {
            const verticesRow = [];

            const v = y / heightSegments;

            params.projected.y = params.extent.south() + v * (params.extent.north() - params.extent.south());

            for (let x = 0; x <= widthSegments; x++) {
                const u = x / widthSegments;
                const idM3 = idVertex * 3;

                params.projected.x = params.extent.west() + u * (params.extent.east() - params.extent.west());

                const vertex = new Vector3(params.projected.x, params.projected.y, 0);

                // move geometry to center world
                vertex.sub(this.center);

                vertex.toArray(outBuffers.position.array, idM3);

                UV_WGS84(outBuffers, idVertex, u, v);
                verticesRow.push(idVertex);

                idVertex++;
            }

            vertices.push(verticesRow);
        }

        let idVertex2 = 0;

        for (let y = 0; y < heightSegments; y++) {
            for (let x = 0; x < widthSegments; x++) {
                const v1 = vertices[y][x + 1];
                const v2 = vertices[y][x];
                const v3 = vertices[y + 1][x];
                const v4 = vertices[y + 1][x + 1];

                idVertex2 = bufferize(outBuffers, v4, v2, v1, idVertex2);
                idVertex2 = bufferize(outBuffers, v4, v3, v2, idVertex2);
            }
        }

        return outBuffers;
    }
}

export default TileGeometry;
