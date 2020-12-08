import * as THREE from 'three';
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
    const color = new THREE.Color();
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

function prepareBufferGeometry(geom, color, altitude) {
    const vertices = new Float32Array((3 * geom.flatCoordinates.length) / geom.stride);
    const colors = new Uint8Array(3 * geom.flatCoordinates.length);

    for (let i = 0; i < (geom.flatCoordinates.length / geom.stride); i++) {
        let j = 0;
        // get the coordinates that geom has
        for (; j < geom.stride; j++) {
            vertices[3 * i + j] = geom.flatCoordinates[geom.stride * i + j];
        }
        // fill the rest of the stride
        if (geom.stride === 2) {
            vertices[3 * i + 2] = Array.isArray(altitude) ? altitude[i] : altitude;
        }
    }
    fillColorArray(
        colors, geom.flatCoordinates.length, color.r * 255, color.g * 255, color.b * 255, 0,
    );

    const threeGeom = new THREE.BufferGeometry();
    threeGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    threeGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
    threeGeom.computeBoundingSphere();
    return threeGeom;
}

function featureToPoint(feature, properties, options) {
    // get altitude / color from properties
    const altitude = getProperty('altitude', options, 0, properties, feature.vertices);
    const color = getProperty('color', options, randomColor, properties);

    const geom = prepareBufferGeometry(
        feature.vertices,
        color,
        altitude,
    );

    return new THREE.Points(geom);
}

function featureToLine(feature, properties, options) {
    // get altitude / color from properties
    const altitude = getProperty('altitude', options, 0, properties, feature.vertices);
    const color = getProperty('color', options, randomColor, properties);

    const geom = prepareBufferGeometry(
        feature.vertices,
        color,
        altitude,
    );

    if (feature.geometry.length > 1) {
        const indices = [];
        // Multi line case
        for (const geometry of feature.geometry) {
            const start = geometry.indices[0].offset;
            const end = start + geometry.indices[0].count;
            for (let j = start; j < end; j++) {
                indices.push(j);
                indices.push(j + 1);
            }
        }
        geom.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
        return new THREE.LineSegments(geom);
    }
    return new THREE.Line(geom);
}

function featureToPolygon(feature, properties, options) {
    // get altitude / color from properties
    const altitude = getProperty('altitude', options, 0, feature);
    const color = getProperty('color', options, randomColor, feature.getProperties());
    const geom = feature.getGeometry();

    const threeGeom = prepareBufferGeometry(geom, color, altitude);

    const ends = geom.getEnds().map(end => end / geom.stride);

    const triangles = Earcut(threeGeom.attributes.position.array, ends.slice(0, -1), 3);

    threeGeom.setIndex(new THREE.BufferAttribute(new Uint16Array(triangles), 1));
    return new THREE.Mesh(threeGeom);
}

function featureToMultiPolygon(feature, properties, options) {
    // get altitude / color from properties
    const altitude = getProperty('altitude', options, 0, feature);
    const color = getProperty('color', options, randomColor, feature.getProperties());
    const geom = feature.getGeometry();

    const threeGeom = prepareBufferGeometry(geom, color, altitude);

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

    threeGeom.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    return new THREE.Mesh(threeGeom);
}

/**
 * Convert a [Feature]{@link Feature#geometry}'s geometry to a Mesh
 *
 * @param {Object} feature - a Feature's geometry
 * @param {Object} options - options controlling the conversion
 * @param {number|function} options.altitude - define the base altitude of the mesh
 * @param {number|function} options.extrude - if defined, polygons will be extruded by the specified
 * amount
 * @param {object|function} options.color - define per feature color
 * @return {THREE.Mesh} mesh
 */
function featureToMesh(feature, options) {
    let mesh;
    switch (feature.getGeometry().getType()) {
        case 'Point':
        case 'MultiPoint': {
            mesh = featureToPoint(feature, feature.properties, options);
            break;
        }
        case 'LineString':
        case 'MultiLineString': {
            mesh = featureToLine(feature, feature.properties, options);
            break;
        }
        case 'Polygon':
            mesh = featureToPolygon(feature, feature.properties, options);
            break;
        case 'MultiPolygon': {
            mesh = featureToMultiPolygon(
                feature,
                feature.properties,
                options,
            );
            break;
        }
        default:
    }

    // set mesh material
    mesh.material.vertexColors = true;
    mesh.material.color = new THREE.Color(0xffffff);

    mesh.properties = feature.properties;

    return mesh;
}

function featuresToThree(features, options) {
    if (!features || features.length === 0) return null;

    if (features.length === 1) {
        return featureToMesh(features[0], options);
    }

    const group = new THREE.Group();
    group.minAltitude = Infinity;

    for (const feature of features) {
        const mesh = featureToMesh(feature, options);
        group.add(mesh);
        group.minAltitude = Math.min(mesh.minAltitude, group.minAltitude);
    }

    return group;
}

/**
 * @module Feature2Mesh
 */
export default {
    /**
     * Return a function that converts [Features]{@link module:GeoJsonParser} to Meshes. Feature
     * collection will be converted to a
     * a THREE.Group.
     *
     * @param {Object} options - options controlling the conversion
     * @param {number|function} options.altitude - define the base altitude of the mesh
     * @param {number|function} options.extrude - if defined, polygons will be extruded by the
     * specified amount
     * @param {object|function} options.color - define per feature color
     * @return {function}
     */
    convert(options = {}) {
        return function _convert(collection) {
            if (!collection) return null;

            return featuresToThree(collection, options);
        };
    },
};
