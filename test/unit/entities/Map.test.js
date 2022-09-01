import { Group } from 'three';
import Extent from '../../../src/Core/Geographic/Extent.js';
import Instance from '../../../src/Core/Instance.js';
import { Map } from '../../../src/entities/Map.js';
import Layer from '../../../src/Core/layer/Layer.js';
import MainLoop from '../../../src/Core/MainLoop.js';

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
        viewerDiv = {};
        viewerDiv.appendChild = jest.fn;
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

        it('should assign passed values', () => {
            expect(map.maxSubdivisionLevel).toBe(15);
            expect(map.sseScale).toBe(1.5);
            expect(map.validityExtent).toEqual(extent);
            expect(map.protocol).toEqual('tile');
            expect(map.visible).toBe(true);
        });

        it('should create a THREE Group for the object3D property', () => {
            expect(map.object3d).toBeInstanceOf(Group);
        });

        it('defines the update, preUpdate, postUpdate methods', () => {
            expect(map.update).toBeDefined();
            expect(map.preUpdate).toBeDefined();
            expect(map.postUpdate).toBeDefined();
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
});
