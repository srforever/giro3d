import { Feature } from 'ol';
import {
    Point, MultiPoint, Polygon, MultiPolygon,
} from 'ol/geom';

import { Vector3 } from 'three';

import OlFeature2Mesh from '../../../../src/renderer/extensions/OlFeature2Mesh.js';

const SIMPLE_SQUARE = [[[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]]];
const SIMPLE_SQUARE_VERTICES = new Float32Array([
    0, 0, 0,
    0, 1, 0,
    1, 1, 0,
    1, 0, 0,
]);
const SIMPLE_SQUARE_INDICES = new Uint16Array([1, 0, 3, 3, 2, 1]);

/*
 * More or less this shape
 * *----------*
 * |          |
 * |          |
 * |  /\      |
 * | /__\     |
 * |          |
 * *----------* */
const SQUARE_WITH_HOLE = [
    [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]],
    [[0.2, 0.2, 0], [0.2, 0.3, 0], [0.3, 0.2, 0], [0.2, 0.2, 0]],
];
const SQUARE_WITH_HOLE_VERTICES = new Float32Array(
    [0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0.2, 0.2, 0, 0.2, 0.3, 0, 0.3, 0.2, 0],
);
// this is the vertices extruded with 1
const EXTRUDED_SQUARE_WITH_HOLE_VERTICES = new Float32Array([
    // bottom face, with the hole
    0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0.2, 0.2, 0, 0.2, 0.3, 0, 0.3, 0.2, 0,
    // top face, only z changes
    0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0.2, 0.2, 1, 0.2, 0.3, 1, 0.3, 0.2, 1,
    // walls on the outer ring
    // 1st wall, first 2 coordinates of bottom face and first 2 coordinates of top face
    0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1,
    // 2nd wall
    0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1,
    // 3rd
    1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1,
    // 4rd
    1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1,
    // walls for the hole
    0.2, 0.2, 0, 0.2, 0.3, 0, 0.2, 0.2, 1, 0.2, 0.3, 1,
    0.2, 0.3, 0, 0.3, 0.2, 0, 0.2, 0.3, 1, 0.3, 0.2, 1,
    0.3, 0.2, 0, 0.2, 0.2, 0, 0.3, 0.2, 1, 0.2, 0.2, 1,
]);
// extruded with a function returning 1..7
const EXTRUDED_WITH_FN_SQUARE_WITH_HOLE_VERTICES = new Float32Array([
    // bottom face, with the hole
    0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0.2, 0.2, 0, 0.2, 0.3, 0, 0.3, 0.2, 0,
    // top face, only z changes
    0, 0, 1, 0, 1, 2, 1, 1, 3, 1, 0, 4, 0.2, 0.2, 5, 0.2, 0.3, 6, 0.3, 0.2, 7,
    // walls on the outer ring
    // 1st wall, first 2 coordinates of bottom face and first 2 coordinates of top face
    0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 2,
    // 2nd wall
    0, 1, 0, 1, 1, 0, 0, 1, 2, 1, 1, 3,
    // 3rd
    1, 1, 0, 1, 0, 0, 1, 1, 3, 1, 0, 4,
    // 4rd
    1, 0, 0, 0, 0, 0, 1, 0, 4, 0, 0, 1,
    // walls for the hole
    0.2, 0.2, 0, 0.2, 0.3, 0, 0.2, 0.2, 5, 0.2, 0.3, 6,
    0.2, 0.3, 0, 0.3, 0.2, 0, 0.2, 0.3, 6, 0.3, 0.2, 7,
    0.3, 0.2, 0, 0.2, 0.2, 0, 0.3, 0.2, 7, 0.2, 0.2, 5,
]);
const SQUARE_WITH_HOLE_INDICES = new Uint16Array([
    0, 4, 5,
    6, 4, 0,
    3, 2, 1,
    1, 0, 5,
    6, 0, 3,
    3, 1, 5,
    5, 6, 3,
]);

describe('OlFeature2Mesh', () => {
    it('should deal with a simple point', () => {
        const f = new Feature({
            geometry: new Point([1, 2, 3]),
        });
        const meshes = OlFeature2Mesh.convert({})([f]);
        expect(meshes).toHaveLength(1);

        const mesh = meshes[0];
        expect(mesh.geometry.getAttribute('position').array).toEqual(new Float32Array([1, 2, 3]));
    });

    it('should deal with a simple point, with offset', () => {
        const f = new Feature({
            geometry: new Point([1, 2, 3]),
        });
        const meshes = OlFeature2Mesh.convert({})([f], new Vector3(3, 4, 5));
        expect(meshes).toHaveLength(1);

        const mesh = meshes[0];
        expect(mesh.isPoints).toBeTruthy();
        expect(mesh.geometry.getAttribute('position').array).toEqual(new Float32Array([-2, -2, -2]));
    });

    it('should deal with several point features', () => {
        const fs = [
            new Feature({
                geometry: new Point([1, 2, 3]),
            }),
            new Feature({
                geometry: new Point([11, 12, 13]),
            }),
            new Feature({
                geometry: new Point([21, 22, 23]),
            }),
        ];

        const meshes = OlFeature2Mesh.convert({})(fs, new Vector3(3, 4, 5));
        expect(meshes).toHaveLength(3);

        expect(meshes[0].geometry.getAttribute('position').array).toEqual(new Float32Array([-2, -2, -2]));
        expect(meshes[1].geometry.getAttribute('position').array).toEqual(new Float32Array([8, 8, 8]));
        expect(meshes[2].geometry.getAttribute('position').array).toEqual(new Float32Array([18, 18, 18]));
    });

    it('should deal with several multipoint', () => {
        const fs = [
            new Feature({
                geometry: new MultiPoint([[1, 2, 3], [4, 5, 6]]),
            }),
            new Feature({
                geometry: new Point([11, 12, 13]),
            }),
            new Feature({
                geometry: new Point([21, 22, 23]),
            }),
        ];

        const meshes = OlFeature2Mesh.convert({})(fs, new Vector3(3, 4, 5));
        expect(meshes).toHaveLength(3);

        expect(meshes[0].isPoints).toBeTruthy();
        expect(meshes[0].geometry.getAttribute('position').array).toEqual(new Float32Array([-2, -2, -2, 1, 1, 1]));
        expect(meshes[1].isPoints).toBeTruthy();
        expect(meshes[1].geometry.getAttribute('position').array).toEqual(new Float32Array([8, 8, 8]));
        expect(meshes[2].isPoints).toBeTruthy();
        expect(meshes[2].geometry.getAttribute('position').array).toEqual(new Float32Array([18, 18, 18]));
    });

    it('should correctly convert a polygon', () => {
        const fs = [
            new Feature({
                geometry: new Polygon(SIMPLE_SQUARE),
            }),
        ];

        const meshes = OlFeature2Mesh.convert({})(fs);
        expect(meshes).toHaveLength(1);

        const mesh = meshes[0];
        expect(mesh.isMesh).toBeTruthy();
        expect(mesh.isPoints).toBeFalsy();
        // NOTE: last (closing) vertex removed
        expect(mesh.geometry.getAttribute('position').array).toEqual(SIMPLE_SQUARE_VERTICES);
        expect(mesh.geometry.index.array).toEqual(SIMPLE_SQUARE_INDICES);
    });

    it('should correctly convert a polygon with offset', () => {
        const fs = [
            new Feature({
                geometry: new Polygon(SIMPLE_SQUARE),
            }),
        ];

        const meshes = OlFeature2Mesh.convert({})(fs, new Vector3(2, 2, 2));
        expect(meshes).toHaveLength(1);

        const mesh = meshes[0];
        expect(mesh.isMesh).toBeTruthy();
        expect(mesh.isPoints).toBeFalsy();
        // NOTE: last (closing) vertex removed
        expect(mesh.geometry.getAttribute('position').array).toEqual(SIMPLE_SQUARE_VERTICES.map(v => v - 2));
        expect(mesh.geometry.index.array).toEqual(SIMPLE_SQUARE_INDICES);
    });

    it('should deal with a polygon with a hole', () => {
        const fs = [
            new Feature({
                geometry: new Polygon(SQUARE_WITH_HOLE),
            }),
        ];

        const meshes = OlFeature2Mesh.convert({})(fs);

        expect(meshes).toHaveLength(1);

        expect(meshes[0].isMesh).toBeTruthy();
        expect(meshes[0].isPoints).toBeFalsy();
        expect(meshes[0].geometry.getAttribute('position').array).toEqual(SQUARE_WITH_HOLE_VERTICES);
        expect(meshes[0].geometry.index.array).toEqual(new Uint16Array(
            SQUARE_WITH_HOLE_INDICES,
        ));
    });

    it('should deal with a polygon with simple extrusion', () => {
        const fs = [
            new Feature({
                geometry: new Polygon([
                    [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]],
                    [[0.2, 0.2, 0], [0.2, 0.3, 0], [0.3, 0.2, 0], [0.2, 0.2, 0]],
                ]),
            }),
        ];

        const meshes = OlFeature2Mesh.convert({ extrusionOffset: 1 })(fs);
        expect(meshes).toHaveLength(1);

        const mesh = meshes[0];

        expect(mesh.isMesh).toBeTruthy();
        expect(mesh.isPoints).toBeFalsy();
        expect(mesh.geometry.getAttribute('position').array).toEqual(EXTRUDED_SQUARE_WITH_HOLE_VERTICES);
        expect(mesh.geometry.index.array.slice(0, 21)).toEqual(SQUARE_WITH_HOLE_INDICES);
        // triangulation of the roof. Just the same, but shifted by the number of vertices of the
        // floor (7)
        expect(mesh.geometry.index.array.slice(21, 42))
            .toEqual(SQUARE_WITH_HOLE_INDICES.map(i => i + 7));
        // walls
        // the first wall vertex id is the 14th, because we have 7 + 7 for the floor and roof
        // and there is 7 walls
        for (let i = 0; i < 7; i++) {
            const startIdx = i * 4;
            const endIdx = (i + 1) * 4;
            const wallTriangles = mesh.geometry.index.array.slice(42 + i * 6, 42 + (i + 1) * 6);
            expect(wallTriangles).toEqual(new Uint16Array([
                14 + startIdx + 0, 14 + startIdx + 1, 14 + startIdx + 2,
                14 + startIdx + 2, 14 + startIdx + 1, 14 + startIdx + 3,
            ]));
        }
    });

    it('should deal with a polygon with per vertex extrusion', () => {
        const fs = [
            new Feature({
                geometry: new Polygon([
                    [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]],
                    [[0.2, 0.2, 0], [0.2, 0.3, 0], [0.3, 0.2, 0], [0.2, 0.2, 0]],
                ]),
            }),
        ];

        const extrusionOffset = f => [1, 2, 3, 4, 5, 6, 7];
        const meshes = OlFeature2Mesh.convert({ extrusionOffset })(fs);
        expect(meshes).toHaveLength(1);

        const mesh = meshes[0];

        expect(mesh.isMesh).toBeTruthy();
        expect(mesh.isPoints).toBeFalsy();
        expect(mesh.geometry.getAttribute('position').array).toEqual(EXTRUDED_WITH_FN_SQUARE_WITH_HOLE_VERTICES);
        expect(mesh.geometry.index.array.slice(0, 21)).toEqual(SQUARE_WITH_HOLE_INDICES);
        // triangulation of the roof. Just the same, but shifted by the number of vertices of the
        // floor (7)
        expect(mesh.geometry.index.array.slice(21, 42))
            .toEqual(SQUARE_WITH_HOLE_INDICES.map(i => i + 7));
        // walls
        // the first wall vertex id is the 14th, because we have 7 + 7 for the floor and roof
        // and there is 7 walls
        for (let i = 0; i < 7; i++) {
            const startIdx = i * 4;
            const endIdx = (i + 1) * 4;
            const wallTriangles = mesh.geometry.index.array.slice(42 + i * 6, 42 + (i + 1) * 6);
            expect(wallTriangles).toEqual(new Uint16Array([
                14 + startIdx + 0, 14 + startIdx + 1, 14 + startIdx + 2,
                14 + startIdx + 2, 14 + startIdx + 1, 14 + startIdx + 3,
            ]));
        }
    });

    it('should deal with a multipolygon', () => {
        const fs = [
            new Feature({
                geometry: new MultiPolygon([SIMPLE_SQUARE]),
            }),
        ];

        const meshes = OlFeature2Mesh.convert({})(fs);
        expect(meshes).toHaveLength(1);

        const mesh = meshes[0];
        expect(mesh.isMesh).toBeTruthy();
        expect(mesh.isPoints).toBeFalsy();
        // NOTE: last (closing) vertex removed
        expect(mesh.geometry.getAttribute('position').array).toEqual(SIMPLE_SQUARE_VERTICES);
        expect(mesh.geometry.index.array).toEqual(SIMPLE_SQUARE_INDICES);
    });

    it('should deal with a multipolygon with holes', () => {
        const fs = [
            new Feature({
                geometry: new MultiPolygon([SQUARE_WITH_HOLE]),
            }),
        ];

        const meshes = OlFeature2Mesh.convert({})(fs);
        expect(meshes).toHaveLength(1);

        expect(meshes[0].isMesh).toBeTruthy();
        expect(meshes[0].isPoints).toBeFalsy();
        expect(meshes[0].geometry.getAttribute('position').array).toEqual(SQUARE_WITH_HOLE_VERTICES);
        expect(meshes[0].geometry.index.array).toEqual(new Uint16Array(
            SQUARE_WITH_HOLE_INDICES,
        ));
    });

    it('should deal with a multipolygon with holes and extrusion', () => {
        const fs = [
            new Feature({
                geometry: new MultiPolygon([SQUARE_WITH_HOLE]),
            }),
        ];

        const meshes = OlFeature2Mesh.convert({ extrusionOffset: 1 })(fs);
        expect(meshes).toHaveLength(1);

        const mesh = meshes[0];

        expect(mesh.isMesh).toBeTruthy();
        expect(mesh.isPoints).toBeFalsy();
        expect(mesh.geometry.getAttribute('position').array).toEqual(EXTRUDED_SQUARE_WITH_HOLE_VERTICES);
        expect(mesh.geometry.index.array.slice(0, 21)).toEqual(SQUARE_WITH_HOLE_INDICES);
        // triangulation of the roof. Just the same, but shifted by the number of vertices of the
        // floor (7)
        expect(mesh.geometry.index.array.slice(21, 42))
            .toEqual(SQUARE_WITH_HOLE_INDICES.map(i => i + 7));
        // walls
        // the first wall vertex id is the 14th, because we have 7 + 7 for the floor and roof
        // and there is 7 walls
        for (let i = 0; i < 7; i++) {
            const startIdx = i * 4;
            const endIdx = (i + 1) * 4;
            const wallTriangles = mesh.geometry.index.array.slice(42 + i * 6, 42 + (i + 1) * 6);
            expect(wallTriangles).toEqual(new Uint16Array([
                14 + startIdx + 0, 14 + startIdx + 1, 14 + startIdx + 2,
                14 + startIdx + 2, 14 + startIdx + 1, 14 + startIdx + 3,
            ]));
        }
    });
});
