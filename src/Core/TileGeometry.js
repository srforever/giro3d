import * as THREE from 'three';

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


function TileGeometry(params, builder) {
    // Constructor
    THREE.BufferGeometry.call(this);

    this.center = builder.Center(params.extent).clone();
    this.extent = params.extent;

    const bufferAttribs = this.computeBuffers(params, builder);

    this.setIndex(bufferAttribs.index);
    this.addAttribute('position', bufferAttribs.position);
    this.addAttribute('uv', bufferAttribs.uv);

    this.computeBoundingBox();
    this.OBB = builder.OBB(this.boundingBox);
}


TileGeometry.prototype = Object.create(THREE.BufferGeometry.prototype);

TileGeometry.prototype.constructor = TileGeometry;

TileGeometry.prototype.computeBuffers = function computeBuffers(params, builder) {
    // Create output buffers.
    const outBuffers = new Buffers();

    const nSeg = params.segment;
    // segments count :
    // Tile : (nSeg + 1) * (nSeg + 1)
    const nVertex = (nSeg + 1) * (nSeg + 1);
    const triangles = (nSeg) * (nSeg) * 2;

    outBuffers.position = new THREE.BufferAttribute(new Float32Array(nVertex * 3), 3);
    outBuffers.index = new THREE.BufferAttribute(
        new Uint32Array(triangles * 3), 1);
    outBuffers.uv = new THREE.BufferAttribute(
        new Float32Array(nVertex * 2), 2);

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
            const id_m3 = idVertex * 3;

            builder.uProjecte(u, params);

            const vertex = builder.VertexPosition(params, params.projected);

            // move geometry to center world
            vertex.sub(this.center);

            vertex.toArray(outBuffers.position.array, id_m3);

            UV_WGS84(outBuffers, idVertex, u, v);
            verticesRow.push(idVertex);

            idVertex++;
        }

        vertices.push(verticesRow);
    }

    function bufferize(va, vb, vc, idVertex) {
        outBuffers.index.array[idVertex + 0] = va;
        outBuffers.index.array[idVertex + 1] = vb;
        outBuffers.index.array[idVertex + 2] = vc;
        return idVertex + 3;
    }

    let idVertex2 = 0;

    for (let y = 0; y < heightSegments; y++) {
        for (let x = 0; x < widthSegments; x++) {
            const v1 = vertices[y][x + 1];
            const v2 = vertices[y][x];
            const v3 = vertices[y + 1][x];
            const v4 = vertices[y + 1][x + 1];

            idVertex2 = bufferize(v4, v2, v1, idVertex2);
            idVertex2 = bufferize(v4, v3, v2, idVertex2);
        }
    }

    return outBuffers;
};

export default TileGeometry;
