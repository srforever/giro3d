import {
    Matrix4,
    MathUtils,
    BufferGeometry,
    Texture,
    Vector3,
    Object3D,
    Vector2,
    UnsignedByteType,
} from 'three';
import Coordinates from '../Core/Geographic/Coordinates.js';

const FAST_READ_Z = 0;

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
 * instance.referenceCRS here.
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
    const { texture } = textureInfo;
    for (let i = 0; i < uv.length; i += 2) {
        uv[i] = MathUtils.clamp(uv[i], 0, texture.image.width - 1);
        uv[i + 1] = MathUtils.clamp(uv[i + 1], 0, texture.image.height - 1);
    }
    if (texture.image.data || texture.data) {
        let buf;

        // Case 1 : render texture with an attached data property
        if (texture.data) {
            buf = texture.data;
            // Case 2 : data texture with an ImageData attached (that contains the buffer)
        } else if (texture.image.data.data) {
            buf = texture.image.data.data;
            // Case 3 : data texture with an buffer attached
        } else {
            buf = texture.image.data;
        }

        // read a single value
        if (uv.length === 2) {
            // texture data is RGBA, so we multiply the index by 4
            const index = (uv[1] * texture.image.width + uv[0]) * 4;
            const raw = buf[index];
            const { min, max } = textureInfo.texture;

            if (texture.type === UnsignedByteType) {
                // The data is Uint8, normalize it to get it between
                // 0 (black -> minimum) and 1 (white -> maximum)
                return min + (raw / 255.0) * (max - min);
            }

            return raw;
        }
        // or read multiple values
        const result = [];
        for (let i = 0; i < uv.length; i += 2) {
            const index = (uv[i + 1] * texture.image.width + uv[i]) * 4;
            const raw = buf[index];
            if (texture.type === UnsignedByteType) {
                const { min, max } = textureInfo.texture;
                result.push(min + (raw / 255.0) * (max - min));
            } else {
                result.push(raw);
            }
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
        const value = d.data[4 * oy * dw + 4 * ox];
        result.push(value);
    }

    if (uv.length === 2) {
        return result[0];
    }
    return result;
}

/**
 * Converts a texture UV to pixels coords on the texture
 *
 * @param {Texture} texture Texture
 * @param {number} u U value
 * @param {number} v V value
 * @returns {object} x and y pixels coordinates
 */
function convertUVtoPixelsCoords(texture, u, v) {
    const { width } = texture.image;
    const { height } = texture.image;

    if (texture.flipY) {
        v = 1 - v;
    }

    const x = MathUtils.clamp(Math.round(u * width), 0, width);
    const y = MathUtils.clamp(Math.round(v * height), 0, height);

    return { x, y };
}

function _readTextureValueNearestFiltering(textureInfo, vertexU, vertexV) {
    const coords = convertUVtoPixelsCoords(textureInfo.texture, vertexU, vertexV);
    return _readTextureValueAt(textureInfo, coords.x, coords.y);
}

function _readZFast(textureInfo, uv) {
    return _readTextureValueNearestFiltering(textureInfo, uv.x, uv.y);
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

    // Note: at this point, the code makes the assumption that each tile always inherit its texture
    // from the parent.
    // offset = offset from bottom-left
    const offset = pt.offsetInExtent(textureInfo.texture.extent);

    // At this point we have:
    //   - textureInfo.texture.image which is the current image
    //     used for rendering, guaranteed to be valid (we return earlier if no texture)
    //   - offset which is the offset in this texture for the coordinate we're
    //     interested in
    pt._values[2] = _readZFast(textureInfo, offset);
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
    getElevationValueAt,
    placeObjectOnGround,
    decodeMapboxElevation,
    convertUVtoPixelsCoords,
    FAST_READ_Z,
};
