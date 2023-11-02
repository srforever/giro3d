import '../setup.js';
import * as THREE from 'three';
import Extent from 'src/core/geographic/Extent';
import AxisGrid, { type Volume } from 'src/entities/AxisGrid';
import Context from 'src/core/Context';
import Camera from 'src/renderer/Camera.js';

const DEFAULT_EXTENT = new Extent('EPSG:3857', -10, 10, -10, 10);
const defaultVolume: Volume = {
    extent: DEFAULT_EXTENT,
    ceiling: 0,
    floor: 0,
};

describe('AxisGrid', () => {
    let context: Context;
    let camera : Camera;
    let threeCamera: THREE.Camera;

    beforeEach(() => {
        threeCamera = new THREE.PerspectiveCamera(45);
        camera = new Camera('foo', 1, 1, { camera: threeCamera });
        context = new Context(camera, null);
    });

    describe('constructor', () => {
        it('should assign the id property', () => {
            const grid = new AxisGrid('foo', { volume: defaultVolume });

            expect(grid.id).toEqual('foo');
        });

        it('should assign the extent property', () => {
            const grid = new AxisGrid('foo', { volume: defaultVolume });

            expect(grid.volume.extent).toBe(DEFAULT_EXTENT);
        });

        it('should assign the object3d property', () => {
            const grid = new AxisGrid('foo', { volume: defaultVolume });

            expect(grid.object3d).toBeInstanceOf(THREE.Group);
        });

        it('should throw if volume is undefined', () => {
            expect(() => new AxisGrid('foo', { volume: undefined })).toThrow(/volume is undefined/);
        });
    });

    describe('ticks', () => {
        it('should set the ticks property', () => {
            const grid = new AxisGrid('foo', { volume: defaultVolume });
            grid.ticks = { x: 1, y: 2, z: 3 };
            expect(grid.ticks).toEqual({ x: 1, y: 2, z: 3 });
        });
    });

    describe('volume', () => {
        it('should set the volume property', () => {
            const grid = new AxisGrid('foo', { volume: defaultVolume });
            grid.volume = { ceiling: 199, floor: 111, extent: new Extent('EPSG:3857', 1, 2, 3, 4) };

            expect(grid.volume).toEqual({ ceiling: 199, floor: 111, extent: new Extent('EPSG:3857', 1, 2, 3, 4) });
        });
    });

    describe('preUpdate', () => {
        it('should set each side visible if its facing toward the camera', () => {
            const grid = new AxisGrid('foo', { volume: { extent: DEFAULT_EXTENT, floor: 0, ceiling: 100 } });
            const midHeight = 50;

            // Set the camera position in the middle of the volume
            threeCamera.position.set(0, 0, midHeight);

            grid.preUpdate(context);

            const sides = [
                // @ts-ignore
                grid._front,
                // @ts-ignore
                grid._back,
                // @ts-ignore
                grid._left,
                // @ts-ignore
                grid._right,
                // @ts-ignore
                grid._floor,
                // @ts-ignore
                grid._ceiling,
            ];

            const vec = new THREE.Vector3();

            function testSide(sideIndex: number) {
                sides[sideIndex].getWorldPosition(vec);
                threeCamera.lookAt(vec);
                threeCamera.updateWorldMatrix(true, true);

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
