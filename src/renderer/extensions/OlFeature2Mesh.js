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
    const { altitude, style, extrude } = options;
    const geom = feature.getGeometry();

    const threeGeom = prepareBufferGeometry(geom, style.color, altitude, offset, extrude);

    const ends = geom.getEnds().map(end => end / geom.stride);

    // lol
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

/**
 * @param {number[]} coordinates The coordinate of the closed shape that form the roof.
 * @param {number} stride The stride in the coordinate array (2 for XY, 3 for XYZ)
 * @param {number[]} offset The offset to apply to vertex positions.
 * @param {number} pointCount The point count in the closed shape, without duplication of
 * the first/last point
 * @param {number[]|number} altitude The altitude.
 * @param {number[]} positions The array containing the positions of the vertices.
 * @param {number[]} normals The array containing the normals of the vertices.
 */
function createRoofVertices(
    coordinates,
    stride,
    offset,
    pointCount,
    altitude,
    positions,
    normals,
) {
    // TODO use the exact up vector from the local coordinate
    // This is irrelevant in a planar coordinate system, though, but for a geographically
    // correct one, we need to compute the normal of the ellipsoid at this point.
    // We can use the same up vector for all points to save time.
    const upVector = new Vector3(0, 0, 1);

    for (let i = 0; i < pointCount; i++) {
        const idx = i * stride;
        const x = coordinates[idx + X] - offset[X];
        const y = coordinates[idx + Y] - offset[Y];

        let z = 0;
        if (stride === 3) {
            z = coordinates[idx + Z];
        } else {
            z = Array.isArray(altitude) ? altitude[idx] : altitude;
        }
        z -= offset[Z];

        positions.push(x, y, z);
        normals.push(upVector.x, upVector.y, upVector.z);
    }
}

/**
 * @param {number} pointCount The point count in the closed shape, without duplication of
 * the first/last point
 * @param {number[]} positions The array containing the positions of the vertices.
 * @param {number[]} normals The array containing the normals of the vertices.
 * @param {number[]} indices The index array.
 * @param {number[]|number} extrude The extrusion distance.
 */
function createSideWallVertices(pointCount, positions, normals, indices, extrude) {
    // Each side is formed by the A, B, C, D vertices, where A is the current coordinate,
    // and B is the next coordinate (thus the segment AB is one side of the polygon).
    // C and D are the same points but with a Z offset.
    // Note that each side has its own vertices, as vertices of sides are not shared with
    // other sides (i.e duplicated) in order to have faceted normals for each side.
    const VERT_STRIDE = 3; // 3 elements per vertex position (X, Y, Z)
    let vertexOffset = 0;

    for (let i = 0; i < pointCount; i++) {
        const idxA = i * VERT_STRIDE;
        const idxB = ((i + 1) % pointCount) * VERT_STRIDE;

        const Ax = positions[idxA + X];
        const Ay = positions[idxA + Y];
        const Az = positions[idxA + Z];

        const Bx = positions[idxB + X];
        const By = positions[idxB + Y];
        const Bz = positions[idxB + Z];

        const zOffset = (Array.isArray(extrude) ? extrude[i] : extrude);

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
        positions.push(Ax, Ay, Az + zOffset); // C
        positions.push(Bx, By, Bz + zOffset); // D

        // The normal of this wall is easily computed with a plane.
        const v0 = tmpv0.set(Ax, Ay, Az);
        const v1 = tmpv1.set(Bx, By, Bz);
        const v2 = tmpv2.set(Bx, By, Bz + zOffset);
        const normal = tempPlane.setFromCoplanarPoints(v0, v1, v2).normal;

        // The four points share the same normal of course as they are coplanar
        normals.push(normal.x, normal.y, normal.z); // A
        normals.push(normal.x, normal.y, normal.z); // B
        normals.push(normal.x, normal.y, normal.z); // C
        normals.push(normal.x, normal.y, normal.z); // D

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
 * @param {Feature} feature The OL feature.
 * @param {number} offset TODO
 * @param {object} options TODO
 */
function featureToMultiPolygon(feature, offset, options) {
    const { altitude, extrude, material } = options;

    const geom = feature.getGeometry();
    /** @type {number} */
    const stride = geom.stride;
    /** @type {number[]} */
    const coordinates = geom.flatCoordinates;

    const bufferGeom = new BufferGeometry();

    // We remove the last point because it is the first point duplicated to close the loop.
    const pointCount = (coordinates.length / stride) - 1;

    const positions = [];
    const normals = [];

    // First we compute the positions and normals of the top vertices (that make the "rooftop").
    createRoofVertices(
        coordinates,
        stride,
        offset,
        pointCount,
        altitude,
        positions,
        normals,
    );

    // Then compute the indices of the rooftop by triangulating using the earcut algorithm.
    let indices = [];
    let start = 0;
    const mapTriangle = i => i + start;
    const normalizingEndsFn = end => end / geom.stride - start;
    // we could use geom.getPolygons, but as we already got all the coordinates
    // in one buffer, it's easier to stay at the geom level and use endss
    for (const ends of geom.getEndss()) {
        // end index (in term of coordinates) of this polygon (after the holes)
        const polyNormEnd = ends[ends.length - 1] / geom.stride;

        // Convert ends from array element indices to number of 3d coordinates relative to the start
        // of this polygon
        const normalizedEnds = ends.map(normalizingEndsFn);
        const triangles = Earcut(
            positions,
            normalizedEnds.slice(0, -1),
            3,
        );

        // shift them to represent their position in the global array
        indices = indices.concat(triangles.map(mapTriangle));
        start = polyNormEnd;
    }

    // Then we compute the vertical sides of the "building".
    if (extrude) {
        createSideWallVertices(pointCount, positions, normals, indices, extrude);
    }

    bufferGeom.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    bufferGeom.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3, true));

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

    // mesh.geometry.computeVertexNormals();
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
