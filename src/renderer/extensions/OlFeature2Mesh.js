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
    Plane,
} from 'three';
import Earcut from 'earcut';
import { Feature } from 'ol';

const VERT_STRIDE = 3; // 3 elements per vertex position (X, Y, Z)
const X = 0;
const Y = 1;
const Z = 2;

const tmpv0 = new Vector3(0, 0, 0);
const tmpv1 = new Vector3(0, 0, 0);
const tmpv2 = new Vector3(0, 0, 0);
const tempPlane = new Plane();

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
    const {
        altitude, style, extrude, material,
    } = options;
    const geom = feature.getGeometry();
    /** @type {number} */
    const stride = geom.getStride();

    const bufferGeom = new BufferGeometry();

    const {
        flatCoordinates: positions,
        triangles: indices,
    } = getCoordsIndicesFromPolygon(geom, offset, altitude, extrude);
    bufferGeom.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    bufferGeom.setIndex(new BufferAttribute(new Uint16Array(indices), 1));

    const mat = (material ? material.clone() : new MeshBasicMaterial());
    return new Mesh(bufferGeom, mat);
}

/**
 * This methods prepares vertices for three.js with coordinates coming from openlayers.
 *
 * It does 2 things:
 *
 * - flatten the array while removing the last vertex of each rings
 * - builds the new hole indices taking into account vertex removals
 *
 * @param {number[][][]} coordinates The coordinate of the closed shape that form the roof.
 * @param {number} stride The stride in the coordinate array (2 for XY, 3 for XYZ)
 * @param {number[]} offset The offset to apply to vertex positions.
 * the first/last point
 * @param {number[]|number} altitude The altitude.
 */
function createFloorVertices(
    coordinates,
    stride,
    offset,
    altitude,
) {
    // TODO use the exact up vector from the local coordinate
    // This is irrelevant in a planar coordinate system, though, but for a geographically
    // correct one, we need to compute the normal of the ellipsoid at this point.
    // We can use the same up vector for all points to save time.
    const upVector = new Vector3(0, 0, 1);

    // iterate on polygon and holes
    const holesIndices = [];
    let currentIndex = 0;
    const positions = [];
    for (const ring of coordinates) {
        // NOTE: rings coming from openlayers are auto-closing, so we need to remove the last vertex
        // of each ring here
        if (currentIndex > 0) {
            holesIndices.push(currentIndex);
        }
        for (let i = 0; i < ring.length - 1; i++) {
            currentIndex++;
            const coord = ring[i];
            positions.push(coord[X] - offset[X]);
            positions.push(coord[Y] - offset[Y]);
            let z = 0;
            if (stride === 3) {
                z = coord[Z];
            } else {
                z = Array.isArray(altitude) ? altitude[i] : altitude;
            }
            z -= offset[Z];
            positions.push(z);
        }
    }
    return { flatCoordinates: positions, holes: holesIndices };
}

/**
 * This methods creates vertex and faces for the walls
 *
 * @param {number[]} positions The array containing the positions of the vertices.
 * @param {number} start vertex in positions to start with
 * @param {end} end vertex in positions to end with
 * @param {number[]} indices The index array.
 * @param {number[]|number} extrude The extrusion distance.
 */
function createWallForRings(positions, start, end, indices, extrude) {
    // Each side is formed by the A, B, C, D vertices, where A is the current coordinate,
    // and B is the next coordinate (thus the segment AB is one side of the polygon).
    // C and D are the same points but with a Z offset.
    // Note that each side has its own vertices, as vertices of sides are not shared with
    // other sides (i.e duplicated) in order to have faceted normals for each side.
    let vertexOffset = 0;
    const pointCount = positions.length / 3;

    for (let i = start; i < end; i++) {
        const idxA = i * VERT_STRIDE;
        const iB = (i + 1) === end ? start : (i + 1);
        const idxB = (iB) * VERT_STRIDE;

        const Ax = positions[idxA + X];
        const Ay = positions[idxA + Y];
        const Az = positions[idxA + Z];

        const Bx = positions[idxB + X];
        const By = positions[idxB + Y];
        const Bz = positions[idxB + Z];

        const zOffsetA = (Array.isArray(extrude) ? extrude[i] : extrude);
        const zOffsetB = (Array.isArray(extrude) ? extrude[iB] : extrude);

        // +Z top
        //      A                    B
        // (Ax, Ay, zMax) ---- (Bx, By, zMax)
        //      |                    |
        //      |                    |
        // (Ax, Ay, zMin) ---- (Bx, By, zMin)
        //      C                    D
        // -Z bottom

        positions.push(Ax, Ay, Az); // A
        positions.push(Bx, By, Bz); // B
        positions.push(Ax, Ay, Az + zOffsetA); // C
        positions.push(Bx, By, Bz + zOffsetB); // D

        // The normal of this wall is easily computed with a plane.
        const v0 = tmpv0.set(Ax, Ay, Az);
        const v1 = tmpv1.set(Bx, By, Bz);
        const v2 = tmpv2.set(Bx, By, Bz + zOffsetB);
        const normal = tempPlane.setFromCoplanarPoints(v0, v1, v2).normal;

        // The indices of the side are the following
        // [A, B, C, C, B, D] to form the two triangles.

        const A = 0;
        const B = 1;
        const C = 2;
        const D = 3;

        const idx = pointCount + vertexOffset;

        indices.push(idx + A);
        indices.push(idx + B);
        indices.push(idx + C);

        indices.push(idx + C);
        indices.push(idx + B);
        indices.push(idx + D);

        vertexOffset += 4;
    }
}

/**
 * Create a roof, basically a copy of the floor with faces shifted by "pointcount" elem
 *
 * NOTE: at the moment, this method must be executed before `createWallForRings`, because we copy
 * the indices array as it is.
 *
 * @param {number[]} positions a flat array of coordinates
 * @param {number} pointCount the number of points to read from position, starting with the first
 * vertex
 * @param {number[]} indices the indices to duplicate for the roof
 * @param {number | number[]} extrude how we extrude
 */
function createRoof(positions, pointCount, indices, extrude) {
    for (let i = 0; i < pointCount; i++) {
        positions.push(positions[i * VERT_STRIDE + X]);
        positions.push(positions[i * VERT_STRIDE + Y]);
        const zOffset = (Array.isArray(extrude) ? extrude[i] : extrude);
        positions.push(positions[i * VERT_STRIDE + Z] + zOffset);
    }
    const iLength = indices.length;
    for (let i = 0; i < iLength; i++) {
        indices.push(indices[i] + pointCount);
    }
}

function getCoordsIndicesFromPolygon(polygon, offset, altitude, extrude) {
    // TODO check
    const stride = polygon.getStride();
    // TODO offset, altitude, positions

    // First we compute the positions of the top vertices (that make the "floor").
    // note that in some dataset, it's the roof and user needs to extrude down.
    const polyCoords = polygon.getCoordinates();
    const { flatCoordinates, holes } = createFloorVertices(
        polyCoords,
        stride,
        offset,
        altitude,
    );
    const pointCount = flatCoordinates.length / 3;

    const ends = polygon.getEnds();
    const triangles = Earcut(flatCoordinates, holes, 3);
    if (extrude) {
        createRoof(flatCoordinates, pointCount, triangles, extrude);
        createWallForRings(flatCoordinates, 0, holes[0] || pointCount, triangles, extrude);
        for (let i = 0; i < holes.length; i++) {
            createWallForRings(
                flatCoordinates,
                holes[i],
                holes[i + 1] || pointCount,
                triangles,
                extrude,
            );
        }
    }

    return { flatCoordinates, triangles };
}

/**
 * @param {Feature} feature The OL feature.
 * @param {number} offset TODO
 * @param {object} options TODO
 */
function featureToMultiPolygon(feature, offset, options) {
    const { altitude, extrude, material } = options;

    const geom = feature.getGeometry();
    /** @type {number} */
    const stride = geom.getStride();

    const bufferGeom = new BufferGeometry();

    let positions = [];

    // Then compute the indices of the rooftop by triangulating using the earcut algorithm.
    let indices = [];
    let start = 0;
    const mapTriangle = i => i + start;
    for (const polygon of geom.getPolygons()) {
        const {
            flatCoordinates,
            triangles,
        } = getCoordsIndicesFromPolygon(polygon, offset, altitude, extrude);

        positions = positions.concat(flatCoordinates);
        indices = indices.concat(triangles.map(mapTriangle));
        // start = ends[ends.length - 1] / geom.stride;
        start = triangles[triangles.length - 1];
    }
    bufferGeom.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));

    bufferGeom.setIndex(new BufferAttribute(new Uint16Array(indices), 1));

    const mat = (material ? material.clone() : new MeshBasicMaterial());
    return new Mesh(bufferGeom, mat);
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
    const opts = { style, altitude, extrude };

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
    mesh.material.color = style.color;
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
