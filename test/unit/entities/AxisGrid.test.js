import '../setup.js';
import * as THREE from 'three';
import Extent from '../../../src/core/geographic/Extent.js';
import AxisGrid from '../../../src/entities/AxisGrid.js';
import Context from '../../../src/core/Context.js';
import Camera from '../../../src/renderer/Camera.js';

const DEFAULT_EXTENT = new Extent('EPSG:3857', -10, 10, -10, 10);

describe('AxisGrid', () => {
    /** @type {Context} */
    let context;
    /** @type {Camera} */
    let camera;
    /** @type {THREE.Camera} */
    let threeCamera;

    beforeEach(() => {
        threeCamera = new THREE.PerspectiveCamera(45);
        camera = new Camera('foo', 1, 1, { camera: threeCamera });
        context = new Context(camera, null, null);
    });

    describe('constructor', () => {
        it('should assign the id property', () => {
            const grid = new AxisGrid('foo', { volume: { extent: DEFAULT_EXTENT } });

            expect(grid.id).toEqual('foo');
        });

        it('should assign the extent property', () => {
            const grid = new AxisGrid('foo', { volume: { extent: DEFAULT_EXTENT } });

            expect(grid.volume.extent).toBe(DEFAULT_EXTENT);
        });

        it('should assign the object3d property', () => {
            const grid = new AxisGrid('foo', { volume: { extent: DEFAULT_EXTENT } });

            expect(grid.object3d).toBeInstanceOf(THREE.Group);
        });

        it('should throw if volume is undefined', () => {
            expect(() => new AxisGrid('foo', {})).toThrow(/volume is undefined/);
        });
    });

    describe('preUpdate', () => {
        it('should set each side visible if its facing toward the camera', () => {
            const grid = new AxisGrid('foo', { volume: { extent: DEFAULT_EXTENT, floor: 0, ceiling: 100 } });
            const midHeight = 50;

            // Set the camera position in the middle of the volume
            threeCamera.position.set(0, 0, midHeight);

            const sides = [
                grid._front,
                grid._back,
                grid._left,
                grid._right,
                grid._floor,
                grid._ceiling,
            ];

            const vec = new THREE.Vector3();

            function testSide(sideIndex) {
                sides[sideIndex].getWorldPosition(vec);
                threeCamera.lookAt(vec);
                threeCamera.updateWorldMatrix();

                grid.preUpdate(context);

                for (let i = 0; i < 6; i++) {
                    expect(sides[i].visible).toEqual(i === sideIndex);
                }
            }

            testSide(0);
            testSide(1);
            testSide(2);
            testSide(3);
            testSide(4);
            testSide(5);
        });
    });
});
