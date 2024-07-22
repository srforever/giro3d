import type { Material } from 'three';
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
import type Feature from 'ol/Feature';
import type {
    Point,
    MultiPoint,
    LineString,
    MultiLineString,
    Polygon,
    MultiPolygon,
} from 'ol/geom';
import type {
    FeatureExtrusionOffsetCallback,
    FeatureElevationCallback,
    FeatureStyle,
    FeatureStyleCallback,
} from '../core/FeatureTypes';

const VERT_STRIDE = 3; // 3 elements per vertex position (X, Y, Z)
const X = 0;
const Y = 1;
const Z = 2;

export interface OlFeature2MeshOptions {
    /** The offset to apply to each vertex */
    offset?: Vector3;
    /** The elevation (per feature or per vertex, or a custom defined elevation via the callback) */
    elevation?: FeatureElevationCallback | number | Array<number>;
    /** The extrusion offset(s) applied to extruded polygon. */
    extrusionOffset?: FeatureExtrusionOffsetCallback | number | Array<number>;
    /** The feature style or style function */
    style?: FeatureStyle | FeatureStyleCallback;
    /** Custom material to apply to meshes. */
    material?: Material;
}

function prepareBufferGeometry(
    geom: Point | MultiPoint | LineString | MultiLineString,
    elevation: number | number[],
    offset: Vector3,
) {
    const stride = geom.getStride();
    const flatCoordinates = geom.getFlatCoordinates();
    const numVertices = geom.getFlatCoordinates().length / stride;
    const vertices = new Float32Array(3 * numVertices);

    for (let i = 0; i < numVertices; i++) {
        // get the coordinates that geom has
        for (let j = 0; j < stride; j++) {
            vertices[3 * i + j] = flatCoordinates[stride * i + j] - offset.getComponent(j);
        }
        // fill the rest of the stride
        if (stride === 2) {
            vertices[3 * i + 2] = Array.isArray(elevation) ? elevation[i] : elevation;
            vertices[3 * i + 2] -= offset.z;
        }
    }

    const threeGeom = new BufferGeometry();
    threeGeom.setAttribute('position', new BufferAttribute(vertices, 3));
    threeGeom.computeBoundingBox();
    return threeGeom;
}

/**
 * This methods prepares vertices for three.js with coordinates coming from openlayers.
 *
 * It does 2 things:
 *
 * - flatten the array while removing the last vertex of each rings
 * - builds the new hole indices taking into account vertex removals
 *
 * @param coordinates - The coordinate of the closed shape that form the roof.
 * @param stride - The stride in the coordinate array (2 for XY, 3 for XYZ)
 * @param offset - The offset to apply to vertex positions.
 * the first/last point
 * @param elevation - The elevation.
 */
function createFloorVertices(
    coordinates: Array<Array<Array<number>>>,
    stride: number,
    offset: Vector3,
    elevation: Array<number> | number,
) {
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
            positions.push(coord[X] - offset.x);
            positions.push(coord[Y] - offset.y);
            let z = 0;
            if (stride === 3) {
                z = coord[Z];
            } else {
                z = Array.isArray(elevation) ? elevation[i] : elevation;
            }
            z -= offset.z;
            positions.push(z);
        }
    }
    return { flatCoordinates: positions, holes: holesIndices };
}

/**
 * This methods creates vertex and faces for the walls
 *
 * @param positions - The array containing the positions of the vertices.
 * @param start - vertex in positions to start with
 * @param end - vertex in positions to end with
 * @param indices - The index array.
 * @param extrusionOffset - The extrusion distance.
 */
function createWallForRings(
    positions: Array<number>,
    start: number,
    end: number,
    indices: Array<number>,
    extrusionOffset: Array<number> | number,
) {
    // Each side is formed by the A, B, C, D vertices, where A is the current coordinate,
    // and B is the next coordinate (thus the segment AB is one side of the polygon).
    // C and D are the same points but with a Z offset.
    // Note that each side has its own vertices, as vertices of sides are not shared with
    // other sides (i.e duplicated) in order to have faceted normals for each side.
    let vertexOffset = 0;
    const pointCount = positions.length / 3;

    for (let i = start; i < end; i++) {
        const idxA = i * VERT_STRIDE;
        const iB = i + 1 === end ? start : i + 1;
        const idxB = iB * VERT_STRIDE;

        const Ax = positions[idxA + X];
        const Ay = positions[idxA + Y];
        const Az = positions[idxA + Z];

        const Bx = positions[idxB + X];
        const By = positions[idxB + Y];
        const Bz = positions[idxB + Z];

        const zOffsetA = Array.isArray(extrusionOffset) ? extrusionOffset[i] : extrusionOffset;
        const zOffsetB = Array.isArray(extrusionOffset) ? extrusionOffset[iB] : extrusionOffset;

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
 * @param positions - a flat array of coordinates
 * @param pointCount - the number of points to read from position, starting with the first vertex
 * @param indices - the indices to duplicate for the roof
 * @param extrusionOffset - the extrusion offset(s) to apply to the roof element.
 */
function createRoof(
    positions: Array<number>,
    pointCount: number,
    indices: Array<number>,
    extrusionOffset: Array<number> | number,
) {
    for (let i = 0; i < pointCount; i++) {
        positions.push(positions[i * VERT_STRIDE + X]);
        positions.push(positions[i * VERT_STRIDE + Y]);
        const zOffset = Array.isArray(extrusionOffset) ? extrusionOffset[i] : extrusionOffset;
        positions.push(positions[i * VERT_STRIDE + Z] + zOffset);
    }
    const iLength = indices.length;
    for (let i = 0; i < iLength; i++) {
        indices.push(indices[i] + pointCount);
    }
}

function getCoordsIndicesFromPolygon(
    polygon: Polygon,
    offset: Vector3,
    elevation: Array<number> | number,
    extrusionOffset: Array<number> | number,
) {
    // TODO check
    const stride = polygon.getStride();
    // TODO offset, elevation, positions

    // First we compute the positions of the top vertices (that make the "floor").
    // note that in some dataset, it's the roof and user needs to extrusionOffset down.
    const polyCoords = polygon.getCoordinates();
    const { flatCoordinates, holes } = createFloorVertices(polyCoords, stride, offset, elevation);
    const pointCount = flatCoordinates.length / 3;

    const triangles = Earcut(flatCoordinates, holes, 3);
    if (extrusionOffset) {
        createRoof(flatCoordinates, pointCount, triangles, extrusionOffset);
        createWallForRings(flatCoordinates, 0, holes[0] || pointCount, triangles, extrusionOffset);
        for (let i = 0; i < holes.length; i++) {
            createWallForRings(
                flatCoordinates,
                holes[i],
                holes[i + 1] || pointCount,
                triangles,
                extrusionOffset,
            );
        }
    }

    return { flatCoordinates, triangles };
}

function featureToPoint(
    geometry: Point | MultiPoint,
    material: Material | null,
    offset: Vector3,
    elevation: number | number[],
): Points<BufferGeometry, Material> {
    const threeGeom = prepareBufferGeometry(geometry, elevation, offset);

    return new Points(threeGeom, material ? material.clone() : new PointsMaterial());
}

function featureToLine(
    geometry: LineString | MultiLineString,
    material: Material | null,
    offset: Vector3,
    elevation: number | number[],
) {
    const threeGeom = prepareBufferGeometry(geometry, elevation, offset);

    return new Line(threeGeom, material ? material.clone() : new LineBasicMaterial());
}

function featureToPolygon(
    geometry: Polygon,
    material: Material | null,
    offset: Vector3,
    elevation: number | number[],
    extrusionOffset: number | number[],
) {
    const bufferGeom = new BufferGeometry();

    const { flatCoordinates: positions, triangles: indices } = getCoordsIndicesFromPolygon(
        geometry,
        offset,
        elevation,
        extrusionOffset,
    );
    bufferGeom.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    bufferGeom.setIndex(new BufferAttribute(new Uint16Array(indices), 1));

    const mat = material ? material.clone() : new MeshBasicMaterial();
    return new Mesh(bufferGeom, mat);
}

function featureToMultiPolygon(
    geometry: MultiPolygon,
    material: Material | null,
    offset: Vector3,
    elevation: number | number[],
    extrusionOffset: number | number[],
) {
    const bufferGeom = new BufferGeometry();

    let positions: Array<number> = [];

    // Then compute the indices of the rooftop by triangulating using the earcut algorithm.
    let indices: Array<number> = [];
    let start = 0;
    const mapTriangle = (i: number) => i + start;
    for (const polygon of geometry.getPolygons()) {
        const { flatCoordinates, triangles } = getCoordsIndicesFromPolygon(
            polygon,
            offset,
            elevation,
            extrusionOffset,
        );

        positions = positions.concat(flatCoordinates);
        indices = indices.concat(triangles.map(mapTriangle));
        start = triangles[triangles.length - 1];
    }
    bufferGeom.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));

    bufferGeom.setIndex(new BufferAttribute(new Uint16Array(indices), 1));

    const mat = material ? material.clone() : new MeshBasicMaterial();
    return new Mesh(bufferGeom, mat);
}

function getValue(options: any, propname: string, defaultValue: any, ...args: any[]) {
    if (propname in options && options[propname] != null) {
        if (typeof options[propname] === 'function') {
            return options[propname](...args);
        }
        return options[propname];
    }

    if (typeof defaultValue === 'function') {
        return defaultValue();
    }
    return defaultValue;
}

function randomStyle() {
    const color = new Color();
    color.setHex(Math.random() * 0xffffff);
    return { color, visible: true };
}

type PointsLinesOrMesh =
    | Points<BufferGeometry, Material | Material>
    | Line<BufferGeometry, Material | LineBasicMaterial>
    | Mesh<BufferGeometry, Material>;

function featureToMesh(feature: Feature, options: OlFeature2MeshOptions = {}): PointsLinesOrMesh {
    let mesh;

    // parse options / make default
    const style = getValue(options, 'style', randomStyle, feature);
    const elevation = getValue(options, 'elevation', 0, feature);
    const extrusionOffset = getValue(options, 'extrusionOffset', 0, feature);
    const offset = getValue(options, 'offset', new Vector3(0, 0, 0));

    let material: Material;
    if ('material' in options && options.material != null) {
        material = options.material;
    }

    switch (feature.getGeometry().getType()) {
        case 'Point':
            mesh = featureToPoint(feature.getGeometry() as Point, material, offset, elevation);

            break;
        case 'MultiPoint': {
            mesh = featureToPoint(feature.getGeometry() as MultiPoint, material, offset, elevation);
            break;
        }
        case 'LineString':
            mesh = featureToLine(feature.getGeometry() as LineString, material, offset, elevation);
            break;
        case 'MultiLineString': {
            mesh = featureToLine(
                feature.getGeometry() as MultiLineString,
                material,
                offset,
                elevation,
            );
            break;
        }
        case 'Polygon':
            mesh = featureToPolygon(
                feature.getGeometry() as Polygon,
                material,
                offset,
                elevation,
                extrusionOffset,
            );
            break;
        case 'MultiPolygon': {
            mesh = featureToMultiPolygon(
                feature.getGeometry() as MultiPolygon,
                material,
                offset,
                elevation,
                extrusionOffset,
            );
            break;
        }
        default:
            throw new Error(`Unsupported polygon type ${feature.getGeometry().getType()}`);
    }

    mesh.geometry.computeVertexNormals();
    // set mesh material
    // mesh.material.vertexColors = true;
    // configure mesh material
    mesh.material.needsUpdate = true;
    mesh.material.side = DoubleSide;
    if ('color' in mesh.material) {
        mesh.material.color = new Color(style.color);
    }
    // we want to test for null or undefined, hence the use of == instead of ===
    // eslint-disable-next-line eqeqeq
    mesh.material.visible = style.visible == undefined ? true : style.visible;

    // remember the ol id. NOTE: if the WFS exposes an id, this is the one we will get :-)
    mesh.userData.id = feature.getId();
    mesh.name = `feat @ id=${mesh.userData.id}`;
    // Remember this feature properties
    mesh.userData.properties = feature.getProperties();

    // put the offset into mesh position
    mesh.position.copy(offset);
    mesh.updateMatrixWorld();

    return mesh;
}

export default {
    /**
     * Converts OpenLayers features to Meshes. Feature
     * collection will be converted to a Group.
     *
     * @param features - the OpenLayers features to convert
     * @param options - options controlling the conversion
     * @returns the meshes
     */
    convert(features: Feature[], options: OlFeature2MeshOptions | null) {
        if (!features) return null;

        const meshes: PointsLinesOrMesh[] = [];

        for (const feature of features) {
            const mesh = featureToMesh(feature, options || {});
            meshes.push(mesh);
        }

        return meshes;
    },
};
