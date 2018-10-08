import * as THREE from 'three';

const cache = new Map();

function Buffers() {
    this.index = null;
    this.position = null;
    this.normal = null;
    this.uv = null;
}

function TileGeometry(params, builder) {
    // Constructor
    THREE.BufferGeometry.call(this);

    this.center = builder.Center(params.extent).clone();
    this.extent = params.extent;

    const bufferAttribs = this.computeBuffers(params, builder);

    this.setIndex(bufferAttribs.index);
    this.addAttribute('position', bufferAttribs.position);
    this.addAttribute('normal', bufferAttribs.normal);
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
    // Skirt : 8 * (nSeg - 1)
    const nVertex = (nSeg + 1) * (nSeg + 1) + (params.disableSkirt ? 0 : 4 * nSeg);
    const triangles = (nSeg) * (nSeg) * 2 + (params.disableSkirt ? 0 : 4 * nSeg * 2);

    outBuffers.position = new THREE.BufferAttribute(new Float32Array(nVertex * 3), 3);
    outBuffers.normal = new THREE.BufferAttribute(new Float32Array(nVertex * 3), 3);

    // Read previously cached values (index and uv.wgs84 only depend on the # of triangles)
    const cacheKey = `${builder.type}_${params.disableSkirt ? 0 : 1}_${params.segment}`;
    const cachedBuffers = cache.get(cacheKey);
    const mustBuildIndexAndWGS84 = !cachedBuffers;
    if (cachedBuffers) {
        outBuffers.index = cachedBuffers.index;
        outBuffers.uv = cachedBuffers.uv;
    } else {
        outBuffers.index = new THREE.BufferAttribute(
            new Uint32Array(triangles * 3), 1);
        outBuffers.uv = new THREE.BufferAttribute(
            new Float32Array(nVertex * 2), 2);

        // Update cache
        cache.set(cacheKey, {
            index: outBuffers.index,
            uv: outBuffers.uv,
        });
    }

    var widthSegments = Math.max(2, Math.floor(nSeg) || 2);
    var heightSegments = Math.max(2, Math.floor(nSeg) || 2);

    var idVertex = 0;
    const vertices = [];
    let skirt = [];
    const skirtEnd = [];

    builder.Prepare(params);

    var UV_WGS84 = function UV_WGS84() {};

    // Define UV computation functions if needed
    if (mustBuildIndexAndWGS84) {
        UV_WGS84 = function UV_WGS84(out, id, u, v) {
            out.uv.array[id * 2 + 0] = u;
            out.uv.array[id * 2 + 1] = v;
        };
    }

    for (let y = 0; y <= heightSegments; y++) {
        var verticesRow = [];

        const v = y / heightSegments;

        builder.vProjecte(v, params);

        for (let x = 0; x <= widthSegments; x++) {
            const u = x / widthSegments;
            const id_m3 = idVertex * 3;

            builder.uProjecte(u, params);

            const vertex = builder.VertexPosition(params, params.projected);
            const normal = builder.VertexNormal(params);

            // move geometry to center world
            vertex.sub(this.center);

            // align normal to z axis
            if (params.quatNormalToZ) {
                vertex.applyQuaternion(params.quatNormalToZ);
                normal.applyQuaternion(params.quatNormalToZ);
            }

            vertex.toArray(outBuffers.position.array, id_m3);
            normal.toArray(outBuffers.normal.array, id_m3);

            UV_WGS84(outBuffers, idVertex, u, v);

            if (!params.disableSkirt) {
                if (y !== 0 && y !== heightSegments) {
                    if (x === widthSegments) {
                        skirt.push(idVertex);
                    } else if (x === 0) {
                        skirtEnd.push(idVertex);
                    }
                }
            }

            verticesRow.push(idVertex);

            idVertex++;
        }

        vertices.push(verticesRow);

        if (y === 0) {
            skirt = skirt.concat(verticesRow);
        } else if (y === heightSegments) {
            skirt = skirt.concat(verticesRow.slice().reverse());
        }
    }

    if (!params.disableSkirt) {
        skirt = skirt.concat(skirtEnd.reverse());
    }

    function bufferize(va, vb, vc, idVertex) {
        outBuffers.index.array[idVertex + 0] = va;
        outBuffers.index.array[idVertex + 1] = vb;
        outBuffers.index.array[idVertex + 2] = vc;
        return idVertex + 3;
    }

    let idVertex2 = 0;

    if (mustBuildIndexAndWGS84) {
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
    }

    const iStart = idVertex;

    // TODO: WARNING beware skirt's size influences performance
    // The size of the skirt is now a ratio of the size of the tile.
    // To be perfect it should depend on the real elevation delta but too heavy to compute
    if (!params.disableSkirt) {
        // We compute the actual size of tile segment to use later for the skirt.
        const segmentSize = new THREE.Vector3().fromArray(outBuffers.position.array).distanceTo(
            new THREE.Vector3().fromArray(outBuffers.position.array, 3));

        var buildIndexSkirt = function buildIndexSkirt() {};
        var buildUVSkirt = function buildUVSkirt() {};

        if (mustBuildIndexAndWGS84) {
            buildIndexSkirt = function buildIndexSkirt(id, v1, v2, v3, v4) {
                id = bufferize(v1, v2, v3, id);
                id = bufferize(v1, v3, v4, id);
                return id;
            };

            buildUVSkirt = function buildUVSkirt(id) {
                outBuffers.uv.array[idVertex * 2 + 0] = outBuffers.uv.array[id * 2 + 0];
                outBuffers.uv.array[idVertex * 2 + 1] = outBuffers.uv.array[id * 2 + 1];
            };
        }

        for (let i = 0; i < skirt.length; i++) {
            const id = skirt[i];
            const id_m3 = idVertex * 3;
            const id2_m3 = id * 3;

            outBuffers.position.array[id_m3 + 0] = outBuffers.position.array[id2_m3 + 0]
                - outBuffers.normal.array[id2_m3 + 0] * segmentSize;
            outBuffers.position.array[id_m3 + 1] = outBuffers.position.array[id2_m3 + 1]
                - outBuffers.normal.array[id2_m3 + 1] * segmentSize;
            outBuffers.position.array[id_m3 + 2] = outBuffers.position.array[id2_m3 + 2]
                - outBuffers.normal.array[id2_m3 + 2] * segmentSize;

            outBuffers.normal.array[id_m3 + 0] = outBuffers.normal.array[id2_m3 + 0];
            outBuffers.normal.array[id_m3 + 1] = outBuffers.normal.array[id2_m3 + 1];
            outBuffers.normal.array[id_m3 + 2] = outBuffers.normal.array[id2_m3 + 2];

            buildUVSkirt(id);

            const idf = (i + 1) % skirt.length;

            const v1 = id;
            const v2 = idVertex;
            const v3 = (idf === 0) ? iStart : idVertex + 1;
            const v4 = skirt[idf];

            idVertex2 = buildIndexSkirt(idVertex2, v1, v2, v3, v4);

            idVertex++;
        }
    }

    return outBuffers;
};

export default TileGeometry;
