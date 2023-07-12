import {
    BufferGeometry,
    BufferAttribute,
    Color,
    DoubleSide,
    Line,
    LineBasicMaterial,
    Mesh,
    MeshBasicMaterial,
    Points,
    PointsMaterial,
    Vector3,
} from 'three';
import Earcut from 'earcut';

function getValue(objOrFn, defaultValue, ...args) {
    if (objOrFn) {
        if (typeof objOrFn === 'function') {
            return objOrFn(...args);
        }
        return objOrFn;
    }

    if (typeof defaultValue === 'function') {
        return defaultValue(...args);
    }

    return defaultValue;
}

// TODO duplicate code with Feature2Mesh
function randomStyle() {
    const color = new Color();
    color.setHex(Math.random() * 0xffffff);
    return { color, visible: true };
}

function fillColorArray(colors, length, r, g, b, offset) {
    const len = offset + length;
    for (let i = offset; i < len; ++i) {
        colors[3 * i] = r;
        colors[3 * i + 1] = g;
        colors[3 * i + 2] = b;
    }
}

/**
 * Add indices for the side faces.
 * We loop over the contour and create a side face made of two triangles.
 *
 * For a ring made of (n) coordinates, there are (n*2) vertices.
 * The (n) first vertices are on the roof, the (n) other vertices are on the floor.
 *
 * If index (i) is on the roof, index (i+length) is on the floor.
 *
 * @param {number[]} indices Array of indices to push to
 * @param {number} length Total vertices count in the geom (excluding the extrusion ones)
 * @param {number} offset the offset in the array
 * @param {number} count the number of indices
 * @param {boolean} isClockWise Wrapping direction
 */
function addExtrudedPolygonSideFaces(indices, length, offset, count, isClockWise) {
    // loop over contour length, and for each point of the contour,
    // add indices to make two triangle, that make the side face
    for (let i = offset; i < offset + count - 1; ++i) {
        if (isClockWise) {
            // first triangle indices
            indices.push(i);
            indices.push(i + length);
            indices.push(i + 1);
            // second triangle indices
            indices.push(i + 1);
            indices.push(i + length);
            indices.push(i + length + 1);
        } else {
            // first triangle indices
            indices.push(i + length);
            indices.push(i);
            indices.push(i + length + 1);
            // second triangle indices
            indices.push(i + length + 1);
            indices.push(i);
            indices.push(i + 1);
        }
    }
}

function prepareBufferGeometry(geom, color, altitude, offset, extrude) {
    const numVertices = (geom.flatCoordinates.length) / geom.stride;
    const vertices = new Float32Array(3 * (extrude ? numVertices * 2 : numVertices));
    const colors = new Uint8Array(3 * (extrude ? numVertices * 2 : numVertices));

    for (let i = 0; i < numVertices; i++) {
        // get the coordinates that geom has
        for (let j = 0; j < geom.stride; j++) {
            vertices[3 * i + j] = geom.flatCoordinates[geom.stride * i + j] - offset[j];
        }
        // fill the "top" face
        if (extrude) {
            // get the coordinates that geom has
            for (let j = 0; j < geom.stride; j++) {
                vertices[3 * (numVertices + i) + j] = geom.flatCoordinates[geom.stride * i + j] - offset[j];
            }
        }
        // fill the rest of the stride
        if (geom.stride === 2) {
            vertices[3 * i + 2] = Array.isArray(altitude) ? altitude[i] : altitude;
            vertices[3 * i + 2] -= offset[2];
        }
        if (extrude) {
            vertices[3 * (numVertices + i) + 2] = vertices[3 * i + 2] + (Array.isArray(extrude) ? extrude[i] : extrude);
        }
    }
    fillColorArray(
        colors, geom.flatCoordinates.length, color.r * 255, color.g * 255, color.b * 255, 0,
    );

    const threeGeom = new BufferGeometry();
    threeGeom.setAttribute('position', new BufferAttribute(vertices, 3));
    // threeGeom.setAttribute('color', new BufferAttribute(colors, 3, true));
    threeGeom.computeBoundingBox();
    return threeGeom;
}

function featureToPoint(feature, offset, options) {
    const { altitude, style } = options;
    const geom = feature.getGeometry();
    const threeGeom = prepareBufferGeometry(geom, style.color, altitude, offset);

    return new Points(
        threeGeom,
        options.material ? options.material.clone() : new PointsMaterial(),
    );
}

function featureToLine(feature, offset, options) {
    const { altitude, style } = options;
    const geom = feature.getGeometry();
    const threeGeom = prepareBufferGeometry(geom, style.color, altitude, offset);

    return new Line(
        threeGeom,
        options.material ? options.material.clone() : new LineBasicMaterial(),
    );
}

function featureToPolygon(feature, offset, options) {
    const { altitude, style, extrude } = options;
    const geom = feature.getGeometry();

    const threeGeom = prepareBufferGeometry(geom, style.color, altitude, offset, extrude);

    const ends = geom.getEnds().map(end => end / geom.stride);

        // lol
    console.log('polygon')
        threeGeom.attributes.position.array.pop();
    const triangles = Earcut(threeGeom.attributes.position.array, ends.slice(0, -1), 3);
    indices = indices.concat(triangles.map(i => i + start));

    // TODO extrusion
    threeGeom.setIndex(new BufferAttribute(new Uint16Array(triangles), 1));
    return new Mesh(
        threeGeom,
        options.material ? options.material.clone() : new MeshBasicMaterial(),
    );
}

function featureToMultiPolygon(feature, offset, options) {
    const { altitude, style, extrude } = options;
    const geom = feature.getGeometry();

    const threeGeom = prepareBufferGeometry(geom, style.color, altitude, offset, extrude);

    let indices = [];
    let start = 0;
    const numVertices = geom.flatCoordinates.length / geom.stride;
    const mapTriangle = i => i + start;
    const mapTriangleExtrude = i => i + start + numVertices;
    const normalizingEndsFn = end => end / geom.stride - start;
    // we could use geom.getPolygons, but as we already got all the coordinates
    // in one buffer, it's easier to stay at the geom level and use endss
    for (const ends of geom.getEndss()) {
        // end index (in term of coordinates) of this polygon (after the holes)
        const polyNormEnd = ends[ends.length - 1] / geom.stride;

        // Convert ends from array element indices to number of 3d coordinates relative to the start
        // of this polygon
    console.log('multipolygon')
        const normalizedEnds = ends.map(normalizingEndsFn);
        // TODO check slice : supposed to remove the last element because ol (?) close polygons
        const triangles = Earcut(
            threeGeom.attributes.position.array.slice(start * 3, (polyNormEnd - 1) * 3),
            normalizedEnds.slice(0, -1),
            3,
        );

        // shift them to represent their position in the global array
        indices = indices.concat(triangles.map(mapTriangle));
        if (extrude) {
            indices = indices.concat(triangles.map(mapTriangleExtrude));
            // TODO isClockwise?
            addExtrudedPolygonSideFaces(indices, numVertices, start, polyNormEnd - start, true);
        }
        start = polyNormEnd;
    }

    threeGeom.setIndex(new BufferAttribute(new Uint16Array(indices), 1));
    return new Mesh(
        threeGeom,
        (options.material ? options.material.clone() : new MeshBasicMaterial()),
    );
}

/**
 * Convert a [Feature]{@link Feature#geometry}'s geometry to a Mesh
 *
 * @param {object} feature a Feature's geometry
 * @param {Vector3} offset The offset to apply to coordinates
 * @param {object} options options controlling the conversion
 * @param {number|Function} options.altitude define the base altitude of the mesh
 * @param {number|Function} options.extrude if defined, polygons will be extruded by the specified
 * amount
 * @param {object|Function} options.style define per feature style
 * @returns {Mesh} mesh
 */
function featureToMesh(feature, offset, options) {
    let mesh;

    // get altitude / style from properties
    const style = getValue(options.style, randomStyle, feature);
    const altitude = getValue(options.altitude, 0, feature);
    const extrude = getValue(options.extrude, 0, feature);
    const opts = { style, altitude, extrude, material: options.material };

    switch (feature.getGeometry().getType()) {
        case 'Point':
        case 'MultiPoint': {
            mesh = featureToPoint(feature, offset, opts);
            break;
        }
        case 'LineString':
        case 'MultiLineString': {
            mesh = featureToLine(feature, offset, opts);
            break;
        }
        case 'Polygon':
            mesh = featureToPolygon(feature, offset, opts);
            break;
        case 'MultiPolygon': {
            mesh = featureToMultiPolygon(feature, offset, opts);
            break;
        }
        default:
    }

    mesh.geometry.computeVertexNormals();
    // set mesh material
    // mesh.material.vertexColors = true;
    // configure mesh material
    mesh.material.needsUpdate = true;
    mesh.material.side = DoubleSide;
    mesh.material.color = new Color(style.color);
    // we want to test for null or undefined, hence the use of == instead of ===
    // eslint-disable-next-line eqeqeq
    mesh.material.visible = style.visible == undefined ? true : style.visible;

    // remember the ol id. NOTE: if the WFS exposes an id, this is the one we will get :-)
    mesh.userData.id = feature.getId();
    // Remember this feature properties
    mesh.userData.properties = feature.getProperties();

    // put the offset into mesh position
    mesh.position.fromArray(offset);
    mesh.updateMatrixWorld();

    return mesh;
}

/**
 * @module Feature2Mesh
 */
export default {
    /**
     * Return a function that converts [Features]{@link module:GeoJsonParser} to Meshes. Feature
     * collection will be converted to a
     * a Group.
     *
     * @param {object} options options controlling the conversion
     * @param {number|Function} options.altitude define the base altitude of the mesh
     * @param {number|Function} options.extrude if defined, polygons will be extruded by the
     * specified amount
     * @param {object|Function} options.style define per feature style
     * @returns {Function} the conversion function
     */
    convert(options = {}) {
        return function _convert(features, offset) {
            if (!features) return null;

            const meshes = [];

            for (const feature of features) {
                const mesh = featureToMesh(feature, offset.toArray(), options);
                meshes.push(mesh);
            }

            return meshes;
        };
    },
};
