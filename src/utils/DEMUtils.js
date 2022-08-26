import {
    Matrix4,
    MathUtils,
    BufferGeometry,
    Vector3,
    Object3D,
    Triangle,
    Vector2,
} from 'three';
import Coordinates from '../Core/Geographic/Coordinates.js';

const FAST_READ_Z = 0;
const PRECISE_READ_Z = 1;

export const ELEVATION_FORMAT = {
    MAPBOX_RGB: 0,
    HEIGHFIELD: 1,
    XBIL: 2,
    RATP_GEOL: 3,
};

/**
 * Utility module to retrieve elevation at a given coordinates.
 * The returned value is read in the elevation textures used by the graphics card
 * to render the tiles (globe or plane).
 * This implies that the return value may change depending on the current tile resolution.
 */
// export default {
/**
 * Return current displayed elevation at coord in meters.
 *
 * @param {module:Entity3D~Entity3D} entity The tile entity owning
 * the elevation textures we're going to query.
 * This is typically the globeLayer or a planeLayer.
 * @param {Coordinates} coord The coordinates that we're interested in
 * @param {number} method 2 available method: FAST_READ_Z (default) or PRECISE_READ_Z. Chosing
 * between the 2 is a compromise between performance and visual quality
 * @param {Array} tileHint Optional array of tiles to speed up the process. You can give
 * candidates tiles likely to contain 'coord'. Otherwise the lookup process starts from the
 * root.
 * @returns {object}  undefined if no result or z: displayed elevation in meters, texture: where
 * the z value comes from, tile: owner of the texture
 */
function getElevationValueAt(entity, coord, method = FAST_READ_Z, tileHint) {
    const result = _readZ(entity, method, coord, tileHint || entity.level0Nodes);
    if (!result) {
        return null;
    }
    return { z: result.coord._values[2], texture: result.texture, tile: result.tile };
}

/**
 * Helper method that will position an object directly on the ground.
 *
 * @param {module:Entity3D~Entity3D} entity The tile entity owning
 * the elevation textures we're going to query.
 * This is typically the globeLayer or a planeLayer.
 * @param {string} objectCRS the CRS used by the object coordinates. You probably want to use
 * view.referenceCRS here.
 * @param {Object3D} obj
 * the [Object3D](https://threejs.org/docs/index.html?q=object3#api/en/core/Object3D) we want to modify.
 * @param {object} options additional options
 * @param {number} options.method see getElevationValueAt documentation
 * @param {boolean} options.modifyGeometry if unset/false, this function will modify
 * object.position. If true, it will modify obj.geometry.vertices or
 * obj.geometry.attributes.position
 * @param {Array} tileHint see getElevationValueAt documentation
 * @returns {boolean} true if successful, false if we couldn't lookup the elevation at the given
 * coords
 */
function placeObjectOnGround(entity, objectCRS, obj, options = {}, tileHint) {
    let tiles;
    if (tileHint) {
        tiles = tileHint.concat(entity.level0Nodes);
    } else {
        tiles = entity.level0Nodes;
    }

    if (!options.modifyGeometry) {
        if (options.cache) {
            options.cache.length = 1;
        }
        const matrices = {
            worldFromLocal: obj.parent ? obj.parent.matrixWorld : undefined,
            localFromWorld: obj.parent
                ? new Matrix4().copy(obj.parent.matrixWorld).invert() : undefined,
        };
        const result = _updateVector3(
            entity,
            options.method || FAST_READ_Z,
            tiles,
            objectCRS,
            obj.position,
            options.offset || 0,
            matrices,
            undefined,
            options.cache ? options.cache[0] : undefined,
        );

        if (!result) {
            return false;
        }
        if (options.cache) {
            options.cache[0] = result;
        }
        obj.updateMatrix();
        obj.updateMatrixWorld();
        return true;
    }
    const matrices = {
        worldFromLocal: obj.matrixWorld,
        localFromWorld: new Matrix4().copy(obj.matrixWorld).invert(),
    };

    const { geometry } = obj;
    if (geometry.vertices) {
        if (options.cache) {
            options.cache.length = geometry.vertices.length;
        }

        let success = true;
        const coord = new Coordinates(objectCRS);
        for (let i = 0; i < geometry.vertices.length; i++) {
            const cached = options.cache ? options.cache[i] : undefined;

            const result = _updateVector3(
                entity,
                options.method || FAST_READ_Z,
                tiles,
                objectCRS,
                geometry.vertices[i],
                options.offset || 0,
                matrices,
                coord,
                cached,
            );

            if (options.cache) {
                options.cache[i] = result;
            }
            if (!result) {
                success = false;
            }
        }
        geometry.verticesNeedUpdate = true;
        return success;
    }
    if (geometry instanceof BufferGeometry) {
        if (options.cache) {
            options.cache.length = geometry.attributes.position.count;
        }
        let success = true;

        const tmp = new Vector3();
        const coord = new Coordinates(objectCRS);
        for (let i = 0; i < geometry.attributes.position.count; i++) {
            const cached = options.cache ? options.cache[i] : undefined;

            tmp.fromBufferAttribute(geometry.attributes.position, i);
            const prev = tmp.z;
            const result = _updateVector3(
                entity,
                options.method || FAST_READ_Z,
                tiles,
                objectCRS,
                tmp,
                options.offset || 0,
                matrices,
                coord,
                cached,
            );
            if (options.cache) {
                options.cache[i] = result;
            }
            if (!result) {
                success = false;
            }
            if (prev !== tmp.z) {
                geometry.attributes.position.needsUpdate = true;
            }
            geometry.attributes.position.setXYZ(i, tmp.x, tmp.y, tmp.z);
        }
        return success;
    }
    return false; // TODO throw?
}

/**
 * Decode pixel value to elevation value in meters for Mapbox/MapTiler elevation data.
 *
 * @param {number} r Red pixel value
 * @param {number} g Green pixel value
 * @param {number} b Blue pixel value
 * @returns {number} Elevation in meters
 */
function decodeMapboxElevation(r, g, b) {
    return -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;
}

function tileAt(pt, tile) {
    if (!tile.extent) {
        return null;
    }
    if (!tile.extent.isPointInside(pt)) {
        return undefined;
    }

    for (let i = 0; i < tile.children.length; i++) {
        const t = tileAt(pt, tile.children[i]);
        if (t) {
            return t;
        }
    }
    return tile;
}

let _canvas;
let ctx;
function _readTextureValueAt(textureInfo, ...uv) {
    const { texture, elevationFormat: format } = textureInfo;
    for (let i = 0; i < uv.length; i += 2) {
        uv[i] = MathUtils.clamp(uv[i], 0, texture.image.width - 1);
        uv[i + 1] = MathUtils.clamp(uv[i + 1], 0, texture.image.height - 1);
    }

    if (texture.image.data) {
        // read a single value
        if (uv.length === 2) {
            return texture.image.data[uv[1] * texture.image.width + uv[0]];
        }
        // or read multiple values
        const result = [];
        for (let i = 0; i < uv.length; i += 2) {
            result.push(texture.image.data[uv[i + 1] * texture.image.width + uv[i]]);
        }
        return result;
    }
    if (!_canvas) {
        _canvas = document.createElement('canvas');
        _canvas.width = 2;
        _canvas.height = 2;
        ctx = _canvas.getContext('2d');
    }
    let minx = Infinity;
    let miny = Infinity;
    let maxx = -Infinity;
    let maxy = -Infinity;
    for (let i = 0; i < uv.length; i += 2) {
        minx = Math.min(uv[i], minx);
        miny = Math.min(uv[i + 1], miny);
        maxx = Math.max(uv[i], maxx);
        maxy = Math.max(uv[i + 1], maxy);
    }
    const dw = maxx - minx + 1;
    const dh = maxy - miny + 1;
    _canvas.width = Math.max(_canvas.width, dw);
    _canvas.height = Math.max(_canvas.height, dh);

    ctx.drawImage(texture.image, minx, miny, dw, dh, 0, 0, dw, dh);
    const d = ctx.getImageData(0, 0, dw, dh);

    const result = [];

    for (let i = 0; i < uv.length; i += 2) {
        const ox = uv[i] - minx;
        const oy = uv[i + 1] - miny;
        if (format === ELEVATION_FORMAT.MAPBOX_RGB) {
            // d is 4 bytes per pixel
            result.push(decodeMapboxElevation(
                d.data[4 * oy * dw + 4 * ox],
                d.data[4 * oy * dw + 4 * ox + 1],
                d.data[4 * oy * dw + 4 * ox + 2],
            ));
        } else if (format === ELEVATION_FORMAT.HEIGHFIELD) {
            // d is 4 bytes per pixel
            const red = (d.data[4 * oy * dw + 4 * ox]) / 256.0;
            const elevation = textureInfo.heightFieldOffset + red * textureInfo.heightFieldScale;
            result.push(elevation);
        } else if (format === ELEVATION_FORMAT.XBIL) {
            throw new Error(`Unimplemented reading elevation value for layer.elevationFormat "${format}'`);
        } else if (format === ELEVATION_FORMAT.RATP_GEOL) {
            throw new Error(`Unimplemented reading elevation value for layer.elevationFormat "${format}'`);
        } else {
            throw new Error(`Unsupported layer.elevationFormat "${format}'`);
        }
    }

    if (uv.length === 2) {
        return result[0];
    }
    return result;
}

function _convertUVtoTextureCoords(texture, u, v) {
    const { width } = texture.image;
    const { height } = texture.image;

    const up = Math.max(0, u * width - 0.5);
    const vp = Math.max(0, v * height - 0.5);

    const u1 = Math.floor(up);
    const u2 = Math.ceil(up);
    const v1 = Math.floor(vp);
    const v2 = Math.ceil(vp);

    const wu = up - u1;
    const wv = vp - v1;

    return {
        u1, u2, v1, v2, wu, wv,
    };
}

function _readTextureValueNearestFiltering(textureInfo, vertexU, vertexV) {
    const coords = _convertUVtoTextureCoords(textureInfo.texture, vertexU, vertexV);

    const u = (coords.wu <= 0) ? coords.u1 : coords.u2;
    const v = (coords.wv <= 0) ? coords.v1 : coords.v2;

    return _readTextureValueAt(textureInfo, u, v);
}

function _readTextureValueWithBilinearFiltering(textureInfo, vertexU, vertexV) {
    const coords = _convertUVtoTextureCoords(textureInfo.texture, vertexU, vertexV);

    const [z11, z21, z12, z22] = _readTextureValueAt(textureInfo,
        coords.u1, coords.v1,
        coords.u2, coords.v1,
        coords.u1, coords.v2,
        coords.u2, coords.v2);

    // horizontal filtering
    const zu1 = MathUtils.lerp(z11, z21, coords.wu);
    const zu2 = MathUtils.lerp(z12, z22, coords.wu);
    // then vertical filtering
    return MathUtils.lerp(zu1, zu2, coords.wv);
}

function _readZFast(textureInfo, uv) {
    return _readTextureValueNearestFiltering(textureInfo, uv.x, uv.y);
}

const bary = new Vector3();
function _readZCorrect(textureInfo, uv, tileDimensions, tileOwnerDimensions) {
    // We need to emulate the vertex shader code that does 2 thing:
    //   - interpolate (u, v) between triangle vertices: u,v will be multiple of 1/nsegments
    //     (for now assume nsegments === 16)
    //   - read elevation texture at (u, v) for

    // Determine u,v based on the vertices count.
    // 'modulo' is the gap (in [0, 1]) between 2 successive vertices in the geometry
    // e.g if you have 5 vertices, the only possible values for u (or v) are: 0, 0.25, 0.5, 0.75, 1
    // so modulo would be 0.25
    // note: currently the number of segments is hard-coded to 16 (see TileProvider) => 17 vertices
    const modulo = (tileDimensions.x / tileOwnerDimensions.x) / (17 - 1);
    let u = Math.floor(uv.x / modulo) * modulo;
    let v = Math.floor(uv.y / modulo) * modulo;

    if (u === 1) {
        u -= modulo;
    }
    if (v === 1) {
        v -= modulo;
    }

    // Build 4 vertices, 3 of them will be our triangle:
    //    11---21
    //    |   / |
    //    |  /  |
    //    | /   |
    //    21---22
    const u1 = u;
    const u2 = u + modulo;
    const v1 = v;
    const v2 = v + modulo;

    // Our multiple z-value will be weigh-blended, depending on the distance of the real point
    // so lu (resp. lv) are the weight. When lu -> 0 (resp. 1) the final value -> z at u1 (resp. u2)
    const lu = (uv.x - u) / modulo;
    const lv = (uv.y - v) / modulo;

    // Determine if we're going to read the vertices from the top-left or lower-right triangle
    // (low-right = on the line 21-22 or under the diagonal lu = 1 - lv)
    const lowerRightTriangle = (lv === 1) || lu / (1 - lv) >= 1;

    const tri = new Triangle(
        new Vector3(u1, v2),
        new Vector3(u2, v1),
        lowerRightTriangle ? new Vector3(u2, v2) : new Vector3(u1, v1),
    );

    // bary holds the respective weight of each vertices of the triangles
    tri.getBarycoord(new Vector3(uv.x, uv.y), bary);

    // read the 3 interesting values
    const z1 = _readTextureValueWithBilinearFiltering(textureInfo, tri.a.x, tri.a.y);
    const z2 = _readTextureValueWithBilinearFiltering(textureInfo, tri.b.x, tri.b.y);
    const z3 = _readTextureValueWithBilinearFiltering(textureInfo, tri.c.x, tri.c.y);

    // Blend with bary
    return z1 * bary.x + z2 * bary.y + z3 * bary.z;
}

const temp = {
    v: new Vector3(),
    coord1: new Coordinates('EPSG:4978'),
    coord2: new Coordinates('EPSG:4978'),
    offset: new Vector2(),
};

function _readZ(entity, method, coord, nodes, cache) {
    const pt = coord.as(entity.extent.crs(), temp.coord1);

    let tile = null;
    // first check in cache
    if (cache && cache.tile && cache.tile.material) {
        tile = tileAt(pt, cache.tile);
    }
    for (let i = 0; !tile && i < nodes.length; i++) {
        tile = tileAt(pt, nodes[i]);
    }

    if (!tile) {
        // failed to find a tile, abort
        return null;
    }

    const textureInfo = tile.material.getElevationTextureInfo();

    // case when there is no elevation layer
    if (!textureInfo) {
        return { coord: pt, tile };
    }

    const src = textureInfo.texture;
    // check cache value if existing
    if (cache) {
        if (cache.id === src.id && cache.version === src.version) {
            return { coord: pt, texture: src, tile };
        }
    }

    // Assuming that tiles are split in 4 children, we lookup the parent that
    // really owns this texture
    let tileWithValidElevationTexture = tile;
    const stepsUpInHierarchy = Math.round(Math.log2(1.0
        / textureInfo.offsetScale.z));
    for (let i = 0; i < stepsUpInHierarchy; i++) {
        tileWithValidElevationTexture = tileWithValidElevationTexture.parent;
    }

    // offset = offset from top-left
    const offset = pt.offsetInExtent(tileWithValidElevationTexture.extent, temp.offset);

    // At this point we have:
    //   - tileWithValidElevationTexture.texture.image which is the current image
    //     used for rendering
    //   - offset which is the offset in this texture for the coordinate we're
    //     interested in
    // We now have 2 options:
    //   - the fast one: read the value of tileWithValidElevationTexture.texture.image
    //     at (offset.x, offset.y) and we're done
    //   - the correct one: emulate the vertex shader code
    if (method === PRECISE_READ_Z) {
        pt._values[2] = _readZCorrect(
            textureInfo,
            offset,
            tile.extent.dimensions(),
            tileWithValidElevationTexture.extent.dimensions(),
        );
    } else {
        pt._values[2] = _readZFast(textureInfo, offset);
    }
    return { coord: pt, texture: src, tile };
}

function _updateVector3(entity, method, nodes, vecCRS, vec, offset, matrices = {}, coords, cache) {
    const coord = coords || new Coordinates(vecCRS);
    if (matrices.worldFromLocal) {
        coord.set(vecCRS, temp.v.copy(vec).applyMatrix4(matrices.worldFromLocal));
    } else {
        coord.set(vecCRS, vec);
    }
    const result = _readZ(entity, method, coord, nodes, cache);
    if (!result) {
        return null;
    }
    result.coord._values[2] += offset;
    result.coord.as(vecCRS, temp.coord2).xyz(vec);
    if (matrices.localFromWorld) {
        vec.applyMatrix4(matrices.localFromWorld);
    }
    return { id: result.texture.id, version: result.texture.version, tile: result.tile };
}

export default {
    getElevationValueAt, placeObjectOnGround, decodeMapboxElevation, FAST_READ_Z, PRECISE_READ_Z,
};
