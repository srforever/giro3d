import { Color, Group } from 'three';
import Extent from '../../../src/Core/Geographic/Extent.js';
import Instance from '../../../src/Core/Instance.js';
import Map from '../../../src/entities/Map.js';
import Layer from '../../../src/Core/layer/Layer.js';
import MainLoop from '../../../src/Core/MainLoop.js';
import { setupGlobalMocks } from '../mocks.js';
import ElevationLayer from '../../../src/Core/layer/ElevationLayer.js';
import RenderingState from '../../../src/Renderer/RenderingState.js';

describe('Map', () => {
    /** @type {HTMLDivElement} */
    let viewerDiv;

    /** @type {Instance} */
    let instance;

    /** @type {MainLoop} */
    let mainLoop;

    /** @type {Map} */
    let map;

    const extent = new Extent('EPSG:4326', {
        west: 0, east: 10, south: 0, north: 10,
    });

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

        map = new Map('myEntity', {
            extent,
            maxSubdivisionLevel: 15,
        });

        instance.add(map);
    });

    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new Map(undefined)).toThrow(/Missing id parameter/);
        });

        it.each([true, false])('should assign the correct materialOptions', b => {
            const opts = {
                extent,
                doubleSided: b,
                hillshading: b,
                backgroundColor: 'red',
                discardNoData: b,
            };
            const m = new Map('foo', opts);

            expect(m.materialOptions).toBeDefined();
            expect(m.materialOptions.hillshading).toEqual(opts.hillshading);
            expect(m.materialOptions.discardNoData).toEqual(opts.discardNoData);
            expect(m.materialOptions.discardNoData).toEqual(opts.doubleSided);
            expect(m.materialOptions.backgroundColor).toEqual(new Color('red'));
        });

        it('should assign passed values', () => {
            expect(map.maxSubdivisionLevel).toBe(15);
            expect(map.sseScale).toBe(1.5);
            expect(map.visible).toBe(true);
            expect(map.extent).toEqual(extent);
        });

        it('should create a THREE Group for the object3D property', () => {
            expect(map.object3d).toBeInstanceOf(Group);
        });

        it('defines the update, preUpdate, postUpdate methods', () => {
            expect(map.update).toBeDefined();
            expect(map.preUpdate).toBeDefined();
            expect(map.postUpdate).toBeDefined();
        });

        it('should honor the provided extent', () => {
            const ex = new Extent('EPSG:3857', -10000, 242444, 34000, 100000);
            const sut = new Map('foo', { extent: ex });
            expect(sut.extent).toEqual(ex);
        });

        it('should have a single root tile if square', () => {
            expect(map.subdivisions).toEqual({ x: 1, y: 1 });
        });

        it('should produce multiple horizontal root tiles if needed', () => {
            const horizontalExtent = new Extent('EPSG:3857', -250, 250, -100, 100);
            const horizontalMap = new Map('horizontal', { extent: horizontalExtent });
            expect(horizontalMap.subdivisions).toEqual({ x: 3, y: 1 });
        });

        it('should produce multiple vertical root tiles if needed', () => {
            const verticalExtent = new Extent('EPSG:3857', -100, 100, -250, 250);
            const verticalMap = new Map('horizontal', { extent: verticalExtent });
            expect(verticalMap.subdivisions).toEqual({ x: 1, y: 3 });
        });

        it('should have an tileIndex', () => {
            expect(map.tileIndex).toBeDefined();
        });
    });

    describe('addLayers', () => {
        it('should accept only Layer object', async () => {
            await expect(map.addLayer()).rejects.toThrowError('layer is not an instance of Layer');
            await expect(map.addLayer(null)).rejects.toThrowError('layer is not an instance of Layer');
            await expect(map.addLayer([])).rejects.toThrowError('layer is not an instance of Layer');
            await expect(map.addLayer(map)).rejects.toThrowError('layer is not an instance of Layer');

            expect(map.getLayers()).toStrictEqual([]);
        });

        it('should add a layer', () => {
            const layer = new Layer('layer', { standalone: true });

            map.addLayer(layer).then(() => {
                expect(map.getLayers()).toStrictEqual([layer]);
            });
        });

        it('should not add 2 layers with the same id', async () => {
            const layer1 = new Layer('layer', { standalone: true });
            const layer2 = new Layer('layer', { standalone: true });

            map.addLayer(layer1);
            await expect(map.addLayer(layer2)).rejects.toThrowError('id already used');
        });

        it('should fire the layer-added event', async () => {
            const layer = new Layer('layer', { standalone: true });
            layer.dispose = jest.fn();
            layer.whenReady = Promise.resolve();

            const listener = jest.fn();

            map.addEventListener('layer-added', listener);

            await map.addLayer(layer);

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('getElevationMinMax', () => {
        it('should return {0, 0} if no elevation layer is present', () => {
            const { min, max } = map.getElevationMinMax();

            expect(min).toEqual(0);
            expect(max).toEqual(0);
        });

        it('should return the min/max value of the elevation layer if present', async () => {
            const layer = new ElevationLayer('layer', { standalone: true });
            layer.minmax = { min: -123, max: 555 };

            await map.addLayer(layer);

            const { min, max } = map.getElevationMinMax();

            expect(min).toEqual(-123);
            expect(max).toEqual(555);
        });

        it('should return the computed min/max value of all elevation layers', async () => {
            const layer1 = new ElevationLayer('layer1', { standalone: true });
            const layer2 = new ElevationLayer('layer2', { standalone: true });

            layer1.minmax = { min: -123, max: 555 };
            layer2.minmax = { min: -969, max: 342 };

            await map.addLayer(layer1);
            await map.addLayer(layer2);

            const { min, max } = map.getElevationMinMax();

            expect(min).toEqual(-969);
            expect(max).toEqual(555);
        });
    });

    describe('removeLayer', () => {
        it('should call dispose() on the removed layer', async () => {
            const layer = new Layer('layer', { standalone: true });
            layer.dispose = jest.fn();
            layer.whenReady = Promise.resolve();

            await map.addLayer(layer);

            map.removeLayer(layer);

            expect(layer.dispose).toHaveBeenCalled();
        });

        it('should fire the layer-removed event', async () => {
            const layer = new Layer('layer', { standalone: true });
            layer.dispose = jest.fn();
            layer.whenReady = Promise.resolve();

            const listener = jest.fn();

            await map.addLayer(layer);

            map.addEventListener('layer-removed', listener);

            map.removeLayer(layer);

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should return true if the layer was present', async () => {
            const layer = new Layer('layer', { standalone: true });
            layer.dispose = jest.fn();
            layer.whenReady = Promise.resolve();

            await map.addLayer(layer);

            expect(map.removeLayer(layer)).toBeTruthy();
            expect(map.removeLayer(layer)).toBeFalsy();
        });
    });

    describe('dispose', () => {
        it('should call dispose on underlying layers', async () => {
            const layer1 = new Layer('layer1', { standalone: true });
            layer1.dispose = jest.fn();
            layer1.whenReady = Promise.resolve();

            const layer2 = new Layer('layer2', { standalone: true });
            layer2.whenReady = Promise.resolve();
            layer2.dispose = jest.fn();

            await map.addLayer(layer1);
            await map.addLayer(layer2);

            map.dispose();

            expect(layer1.dispose).toHaveBeenCalledTimes(1);
            expect(layer2.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('setRenderState', () => {
        it('should update the render state of the root nodes', () => {
            const fn = jest.fn();
            map.level0Nodes.forEach(n => { n.pushRenderState = fn; });

            const state = RenderingState.DEPTH;
            map.setRenderState(state);

            expect(fn).toHaveBeenCalledWith(state);
        });

        it('should return a function that restores the previous state', () => {
            const restoreFuncs = [];

            map.level0Nodes.forEach(n => {
                const fn = jest.fn();
                n.pushRenderState = () => fn;
                restoreFuncs.push(fn);
            });

            const restore = map.setRenderState(RenderingState.DEPTH);

            restore();

            for (const fn of restoreFuncs) {
                expect(fn).toHaveBeenCalled();
            }
        });
    });
});
