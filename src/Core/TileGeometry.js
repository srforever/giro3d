import { BufferAttribute, BufferGeometry } from 'three';

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
    constructor(params, builder) {
        super();

        this.center = builder.Center(params.extent).clone();
        this.extent = params.extent;

        const bufferAttribs = this.computeBuffers(params, builder);

        this.setIndex(bufferAttribs.index);
        this.setAttribute('position', bufferAttribs.position);
        this.setAttribute('uv', bufferAttribs.uv);

        this.computeBoundingBox();
        this.OBB = builder.OBB(this.boundingBox);
    }

    computeBuffers(params, builder) {
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

        builder.Prepare(params);

        for (let y = 0; y <= heightSegments; y++) {
            const verticesRow = [];

            const v = y / heightSegments;

            builder.vProjecte(v, params);

            for (let x = 0; x <= widthSegments; x++) {
                const u = x / widthSegments;
                const idM3 = idVertex * 3;

                builder.uProjecte(u, params);

                const vertex = builder.VertexPosition(params, params.projected);

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
