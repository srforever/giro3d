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

function getProperty(name, options, defaultValue, ...args) {
    const property = options[name];

    if (property) {
        if (typeof property === 'function') {
            return property(...args);
        }
        return property;
    }

    if (typeof defaultValue === 'function') {
        return defaultValue(...args);
    }

    return defaultValue;
}

// TODO duplicate code with Feature2Mesh
function randomColor() {
    const color = new Color();
    color.setHex(Math.random() * 0xffffff);
    return color;
}

function fillColorArray(colors, length, r, g, b, offset) {
    const len = offset + length;
    for (let i = offset; i < len; ++i) {
        colors[3 * i] = r;
        colors[3 * i + 1] = g;
        colors[3 * i + 2] = b;
    }
}

function prepareBufferGeometry(geom, color, altitude, offset) {
    const vertices = new Float32Array((3 * geom.flatCoordinates.length) / geom.stride);
    const colors = new Uint8Array(3 * geom.flatCoordinates.length);

    for (let i = 0; i < (geom.flatCoordinates.length / geom.stride); i++) {
        // get the coordinates that geom has
        for (let j = 0; j < geom.stride; j++) {
            vertices[3 * i + j] = geom.flatCoordinates[geom.stride * i + j] - offset[j];
        }
        // fill the rest of the stride
        if (geom.stride === 2) {
            vertices[3 * i + 2] = Array.isArray(altitude) ? altitude[i] : altitude;
            vertices[3 * i + 2] -= offset[2];
        }
    }
    fillColorArray(
        colors, geom.flatCoordinates.length, color.r * 255, color.g * 255, color.b * 255, 0,
    );

    const threeGeom = new BufferGeometry();
    threeGeom.setAttribute('position', new BufferAttribute(vertices, 3));
    threeGeom.setAttribute('color', new BufferAttribute(colors, 3, true));
    threeGeom.computeBoundingBox();
    threeGeom.computeVertexNormals();
    return threeGeom;
}

function featureToPoint(feature, offset, options) {
    // get altitude / color from properties
    const altitude = getProperty('altitude', options, 0, feature);
    const color = getProperty('color', options, randomColor, feature.getProperties());

    const geom = feature.getGeometry();
    const threeGeom = prepareBufferGeometry(geom, color, altitude, offset);

    return new Points(
        threeGeom,
        options.material ? options.material.clone() : new PointsMaterial(),
    );
}

function featureToLine(feature, offset, options) {
    // get altitude / color from properties
    const altitude = getProperty('altitude', options, 0, feature);
    const color = getProperty('color', options, randomColor, feature.getProperties());

    const geom = feature.getGeometry();
    const threeGeom = prepareBufferGeometry(geom, color, altitude, offset);

    return new Line(
        threeGeom,
        options.material ? options.material.clone() : new LineBasicMaterial(),
    );
}

function featureToPolygon(feature, offset, options) {
    // get altitude / color from properties
    const altitude = getProperty('altitude', options, 0, feature);
    const color = getProperty('color', options, randomColor, feature.getProperties());
    const geom = feature.getGeometry();

    const threeGeom = prepareBufferGeometry(geom, color, altitude, offset);

    const ends = geom.getEnds().map(end => end / geom.stride);

    const triangles = Earcut(threeGeom.attributes.position.array, ends.slice(0, -1), 3);

    threeGeom.setIndex(new BufferAttribute(new Uint16Array(triangles), 1));
    return new Mesh(
        threeGeom,
        options.material ? options.material.clone() : new MeshBasicMaterial(),
    );
}

function featureToMultiPolygon(feature, offset, options) {
    // get altitude from properties
    const altitude = getProperty('altitude', options, 0, feature);
    const color = getProperty('color', options, randomColor, feature.getProperties());
    const geom = feature.getGeometry();

    const threeGeom = prepareBufferGeometry(geom, color, altitude, offset);

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
            threeGeom.attributes.position.array.slice(start * 3, polyNormEnd * 3),
            normalizedEnds.slice(0, -1),
            3,
        );

        // shift them to represent their position in the global array
        indices = indices.concat(triangles.map(mapTriangle));
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
 * @param {object|Function} options.color define per feature color
 * @returns {Mesh} mesh
 */
function featureToMesh(feature, offset, options) {
    let mesh;
    switch (feature.getGeometry().getType()) {
        case 'Point':
        case 'MultiPoint': {
            mesh = featureToPoint(feature, offset, options);
            break;
        }
        case 'LineString':
        case 'MultiLineString': {
            mesh = featureToLine(feature, offset, options);
            break;
        }
        case 'Polygon':
            mesh = featureToPolygon(feature, offset, options);
            break;
        case 'MultiPolygon': {
            mesh = featureToMultiPolygon(feature, offset, options);
            break;
        }
        default:
    }

    // configure mesh material
    mesh.material.needsUpdate = true;
    mesh.material.side = DoubleSide;

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
     * @param {object|Function} options.color define per feature color
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
