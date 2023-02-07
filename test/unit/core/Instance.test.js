import { Group, Object3D, Vector2 } from 'three';
import proj4 from 'proj4';
import Extent from '../../../src/core/geographic/Extent.js';
import Instance, { INSTANCE_EVENTS } from '../../../src/core/Instance.js';
import Layer from '../../../src/core/layer/Layer.js';
import MainLoop from '../../../src/core/MainLoop.js';
import Map from '../../../src/entities/Map.js';
import Tiles3D from '../../../src/entities/Tiles3D.js';
import { setupGlobalMocks, resizeObservers } from '../mocks.js';

describe('Instance', () => {
    /** @type {HTMLDivElement} */
    let viewerDiv;

    /** @type {Instance} */
    let instance;

    /** @type {MainLoop} */
    let mainLoop;

    beforeEach(() => {
        setupGlobalMocks();
        viewerDiv = document.createElement('div');
        mainLoop = {
            gfxEngine: {
                getWindowSize: jest.fn,
                renderer: {
                    domElement: viewerDiv,
                },
            },
            scheduleUpdate: jest.fn,
            scheduler: {
                getProtocolProvider: jest.fn,
            },
        };
        const options = { mainLoop };
        instance = new Instance(viewerDiv, options);
    });

    describe('constructor', () => {
        it('should observe the resizing of the DOM element', () => {
            const lastObserver = resizeObservers[resizeObservers.length - 1];
            expect(lastObserver.observe).toHaveBeenCalledWith(viewerDiv);
        });
    });

    describe('canvasToNormalizedCoords', () => {
        it('should return the passed target', () => {
            const target = new Vector2();
            const input = new Vector2();
            const result = instance.canvasToNormalizedCoords(input, target);
            expect(result).toBe(target);
        });
    });

    describe('normalizedToCanvasCoords', () => {
        it('should return the passed target', () => {
            const target = new Vector2();
            const input = new Vector2();
            const result = instance.normalizedToCanvasCoords(input, target);
            expect(result).toBe(target);
        });
    });

    describe('eventToNormalizedCoords', () => {
        it('should return the passed target', () => {
            if (window.TouchEvent) {
                const target = new Vector2();
                const event = new TouchEvent('foo');
                const result = instance.eventToNormalizedCoords(event, target);
                expect(result).toBe(target);
            }
        });
    });

    describe('eventToCanvasCoords', () => {
        it('should return the passed target', () => {
            if (window.TouchEvent) {
                const target = new Vector2();
                const event = new TouchEvent('foo');
                const result = instance.eventToCanvasCoords(event, target);
                expect(result).toBe(target);
            }
        });
    });

    describe('add', () => {
        it('should return a rejected promise if not of correct type', async () => {
            const layer = new Layer('foo', { standalone: true });
            await expect(instance.add(layer)).rejects.toThrowError('object is not an instance of THREE.Object3D or Giro3d.Entity');
        });

        it('should add the object to threeObjects if it is a native three.js object', () => {
            const o = new Object3D();
            instance.add(o);
            expect(instance.threeObjects.children).toContain(o);
        });

        it('should add a map', () => {
            const map = new Map('myEntity', {
                extent: new Extent('EPSG:4326', {
                    west: 0, east: 10, south: 0, north: 10,
                }),
                maxSubdivisionLevel: 15,
            });
            return instance.add(map).then(() => {
                expect(instance.getObjects()).toStrictEqual([map]);
            });
        });

        it('should add a Tiles3D', () => {
            const tiles3d = new Tiles3D('myEntity', { url: 'https://domain.tld/tileset.json' });
            return instance.add(tiles3d).then(() => {
                expect(instance.getObjects()).toStrictEqual([tiles3d]);
            });
        });

        it('should add a THREE.js Object3D', () => {
            const obj = new Group();
            return instance.add(obj).then(() => {
                expect(instance.getObjects()).toStrictEqual([obj]);
            });
        });

        it('should fire the entity-added event', () => {
            let eventFired = false;

            const map = new Map('myEntity', {
                extent: new Extent('EPSG:4326', {
                    west: 0, east: 10, south: 0, north: 10,
                }),
                maxSubdivisionLevel: 15,
            });

            instance.addEventListener(INSTANCE_EVENTS.ENTITY_ADDED, () => { eventFired = true; });

            expect(eventFired).toBeFalsy();

            return instance.add(map).then(() => {
                expect(eventFired).toBeTruthy();
            });
        });
    });

    describe('remove', () => {
        it('should remove the object from the list', () => {
            const map = new Map('owner', { extent: new Extent('EPSG:4326', 0, 0, 0, 0) });
            instance.add(map);

            expect(instance._objects.includes(map)).toBeTruthy();

            instance.remove(map);

            expect(instance._objects.includes(map)).toBeFalsy();
        });

        it('should remove the object from threeObjects if it is a native three.js object', () => {
            const o = new Object3D();
            instance.add(o);
            expect(instance.threeObjects.children).toContain(o);

            instance.remove(o);
            expect(instance.threeObjects.children).not.toContain(o);
        });

        it('should call the dispose() method if it exists', () => {
            const map = new Map('owner', { extent: new Extent('EPSG:4326', 0, 0, 0, 0) });
            map.dispose = jest.fn();
            return instance.add(map).then(() => {
                instance.remove(map);
                expect(map.dispose).toHaveBeenCalled();
            });
        });

        it('should fire the entity-removed event', () => {
            let eventFired = false;

            const map = new Map('myEntity', {
                extent: new Extent('EPSG:4326', {
                    west: 0, east: 10, south: 0, north: 10,
                }),
                maxSubdivisionLevel: 15,
            });

            instance.addEventListener(INSTANCE_EVENTS.ENTITY_REMOVED, () => { eventFired = true; });

            expect(eventFired).toBeFalsy();

            instance.add(map).then(() => {
                instance.remove(map);
                expect(eventFired).toBeTruthy();
            });
        });
    });

    describe('registerCRS', () => {
        it('should throw if name or value is undefined', () => {
            expect(() => Instance.registerCRS(undefined, '')).toThrow(/missing CRS name/);
            expect(() => Instance.registerCRS('', '')).toThrow(/missing CRS name/);
            expect(() => Instance.registerCRS('EPSG:foo', '')).toThrow(/missing CRS PROJ string/);
            expect(() => Instance.registerCRS('EPSG:foo', undefined)).toThrow(/missing CRS PROJ string/);
        });

        it('should remember previously registered CRSes', () => {
            Instance.registerCRS('EPSG:3946', '+proj=lcc +lat_0=46 +lon_0=3 +lat_1=45.25 +lat_2=46.75 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

            expect(Object.keys(proj4.defs).includes('EPSG:3946')).toBeTruthy();

            Instance.registerCRS('EPSG:5011', '+proj=geocent +ellps=GRS80 +units=m +no_defs +type=crs');

            expect(Object.keys(proj4.defs).includes('EPSG:3946')).toBeTruthy();
            expect(Object.keys(proj4.defs).includes('EPSG:5011')).toBeTruthy();
        });
    });
});
