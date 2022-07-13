import { PerspectiveCamera, Plane, Vector3 } from 'three';

import Context from '../../src/Core/Context.js';

describe('Context', () => {
    const threeCamera = new PerspectiveCamera(75);

    beforeEach(() => {
        threeCamera.position.set(2, 4, 10);
    });

    describe('Constructor', () => {
        it('should assigns properties', () => {
            const camera = {
                camera3D: threeCamera,
            };
            const scheduler = {};
            const instance = {};

            const context = new Context(camera, scheduler, instance);

            expect(context.camera).toBe(camera);
            expect(context.scheduler).toBe(scheduler);
            expect(context.instance).toBe(instance);
            expect(context.fastUpdateHint).toBeUndefined();
            expect(context.distance.min).toBe(Infinity);
            expect(context.distance.max).toBe(0);
            expect(context.distance.plane).toEqual(
                new Plane()
                    .setFromNormalAndCoplanarPoint(
                        threeCamera.getWorldDirection(new Vector3()),
                        threeCamera.position,
                    ),
            );
        });
    });
});
