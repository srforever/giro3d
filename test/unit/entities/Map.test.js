import { Color, Group, Object3D } from 'three';
import Extent from '../../../src/core/geographic/Extent.js';
import Instance from '../../../src/core/Instance.js';
import Map from '../../../src/entities/Map.js';
import Layer from '../../../src/core/layer/Layer.js';
import MainLoop from '../../../src/core/MainLoop.js';
import { setupGlobalMocks } from '../mocks.js';
import ElevationLayer from '../../../src/core/layer/ElevationLayer.js';
import RenderingState from '../../../src/renderer/RenderingState.js';
import ColorLayer from '../../../src/core/layer/ColorLayer.js';
import NullSource from '../../../src/sources/NullSource.js';
import { DEFAULT_AZIMUTH, DEFAULT_ZENITH } from '../../../src/renderer/LayeredMaterial.js';

const nullSource = new NullSource({ extent: new Extent('EPSG:3857', -10, 10, -10, 10) });

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
                    getClearAlpha: jest.fn(),
                    setClearAlpha: jest.fn(),
                    getRenderTarget: jest.fn(),
                    setRenderTarget: jest.fn(),
                    getScissorTest: jest.fn(),
                    setScissorTest: jest.fn(),
                    getScissor: jest.fn(),
                    setScissor: jest.fn(),
                    getClearColor: jest.fn(),
                    setClearColor: jest.fn(),
                    getViewport: jest.fn(),
                    setViewport: jest.fn(),
                    clear: jest.fn(),
                    render: jest.fn(),
                },
            },
            scheduleUpdate: jest.fn,
            scheduler: {},
        };
        const options = { mainLoop, crs: extent.crs() };
        instance = new Instance(viewerDiv, options);

        map = new Map('myEntity', {
            extent,
            maxSubdivisionLevel: 15,
        });

        instance.add(map);
    });

    function checkLayerIndices() {
        const indices = map._attachedLayers.map(lyr => map.getIndex(lyr));
        for (let i = 0; i < indices.length; i++) {
            expect(indices[i]).toEqual(i);
        }
    }

    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new Map(undefined)).toThrow(/Missing id parameter/);
        });

        it('should throw if the extent is invalid', () => {
            // reversed extent (min values are greater than max values)
            const invalid = new Extent('EPSG:3857', +10, -10, +5, -5);

            expect(() => new Map('foo', { extent: invalid })).toThrow(/Invalid extent/);
        });

        it('should honor hillshading parameters when hillshading is a boolean', () => {
            const m = new Map('foo', {
                extent,
                hillshading: true,
            });

            expect(m.materialOptions.hillshading.enabled).toEqual(true);
            expect(m.materialOptions.hillshading.elevationLayersOnly).toEqual(false);
            expect(m.materialOptions.hillshading.zenith).toEqual(DEFAULT_ZENITH);
            expect(m.materialOptions.hillshading.azimuth).toEqual(DEFAULT_AZIMUTH);
        });

        it('should honor hillshading parameters', () => {
            const m1 = new Map('foo', {
                extent,
                hillshading: {
                    enabled: true,
                    elevationLayersOnly: true,
                    zenith: 32,
                    azimuth: 98,
                },
            });

            expect(m1.materialOptions.hillshading.enabled).toEqual(true);
            expect(m1.materialOptions.hillshading.elevationLayersOnly).toEqual(true);
            expect(m1.materialOptions.hillshading.zenith).toEqual(32);
            expect(m1.materialOptions.hillshading.azimuth).toEqual(98);

            // Check if the map assigns default values to parameters
            const m2 = new Map('foo', {
                extent,
                hillshading: {
                    enabled: true,
                    azimuth: 98,
                },
            });

            expect(m2.materialOptions.hillshading.enabled).toEqual(true);
            expect(m2.materialOptions.hillshading.elevationLayersOnly).toEqual(false);
            expect(m2.materialOptions.hillshading.zenith).toEqual(DEFAULT_ZENITH);
            expect(m2.materialOptions.hillshading.azimuth).toEqual(98);
        });

        it.each([true, false])('should assign the correct materialOptions', b => {
            const opts = {
                extent,
                doubleSided: b,
                backgroundColor: 'red',
                discardNoData: b,
            };
            const m = new Map('foo', opts);

            expect(m.materialOptions).toBeDefined();
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
            const layer = new Layer('layer', { source: nullSource });

            map.addLayer(layer).then(() => {
                expect(map.getLayers()).toStrictEqual([layer]);
            });
        });

        it('should not add 2 layers with the same id', async () => {
            const layer1 = new Layer('layer', { source: nullSource });
            const layer2 = new Layer('layer', { source: nullSource });

            map.addLayer(layer1);
            await expect(map.addLayer(layer2)).rejects.toThrowError('id already used');
        });

        it('should fire the layer-added event', async () => {
            const layer = new Layer('layer', { source: nullSource });
            layer.dispose = jest.fn();
            layer.whenReady = Promise.resolve();

            const listener = jest.fn();

            map.addEventListener('layer-added', listener);

            await map.addLayer(layer);

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('insertLayerAfter', () => {
        it('should throw if the layer is not present', () => {
            const absent = { id: 'a' };
            const present = { id: 'b' };
            map._attachedLayers.push(present);
            expect(() => map.insertLayerAfter(absent, present)).toThrow(/The layer is not present/);
        });

        it('should move the layer at the beginning of the list if target is null', () => {
            const a = { id: 'a' };
            const b = { id: 'b' };
            const c = { id: 'c' };
            const d = { id: 'd' };

            map._attachedLayers.push(a);
            map._attachedLayers.push(b);
            map._attachedLayers.push(c);
            map._attachedLayers.push(d);

            map.insertLayerAfter(d, null);
            expect(map._attachedLayers).toStrictEqual([d, a, b, c]);
        });

        it('should move the layer just after the target', () => {
            const a = { id: 'a' };
            const b = { id: 'b' };
            const c = { id: 'c' };
            const d = { id: 'd' };

            map._attachedLayers.push(a);
            map._attachedLayers.push(b);
            map._attachedLayers.push(c);
            map._attachedLayers.push(d);

            map.insertLayerAfter(a, d);

            expect(map._attachedLayers).toStrictEqual([b, c, d, a]);
            checkLayerIndices();

            map.insertLayerAfter(d, a);

            expect(map._attachedLayers).toStrictEqual([b, c, a, d]);
            checkLayerIndices();

            map.insertLayerAfter(c, b);

            expect(map._attachedLayers).toStrictEqual([b, c, a, d]);
            checkLayerIndices();

            map.insertLayerAfter(a, b);

            checkLayerIndices();
            expect(map._attachedLayers).toStrictEqual([b, a, c, d]);
        });

        it('should signal the order change to tiles', () => {
            const tile = new Group();
            tile.isTileMesh = true;
            tile.reorderLayers = jest.fn();
            tile.layer = map;

            map.level0Nodes.push(tile);

            const a = { id: 'a' };
            const b = { id: 'b' };
            const c = { id: 'c' };
            const d = { id: 'd' };

            map._attachedLayers.push(a);
            map._attachedLayers.push(b);
            map._attachedLayers.push(c);
            map._attachedLayers.push(d);

            expect(tile.reorderLayers).not.toHaveBeenCalled();

            map.insertLayerAfter(a, b);

            expect(tile.reorderLayers).toHaveBeenCalled();
        });
    });

    describe('sortColorLayers', () => {
        function mkColorLayer(key) {
            const layer = new ColorLayer(`${key}`, { source: nullSource });
            layer.key = key;
            return layer;
        }

        function mkElevationLayer(key) {
            const layer = new ElevationLayer(`${key}`, { source: nullSource });
            layer.key = key;
            return layer;
        }

        it('should throw if the compareFn is null', () => {
            expect(() => map.sortColorLayers(null)).toThrow(/missing comparator/);
            expect(() => map.sortColorLayers(undefined)).toThrow(/missing comparator/);
        });

        it('should assign the correct index to each layer', () => {
            const a = mkColorLayer(2);
            const b = mkColorLayer(10);
            const c = mkColorLayer(6);
            const d = mkColorLayer(0);
            const elev = mkElevationLayer(999);

            map._attachedLayers.push(a);
            map._attachedLayers.push(b);
            map._attachedLayers.push(elev);
            map._attachedLayers.push(c);
            map._attachedLayers.push(d);

            map.sortColorLayers((l1, l2) => (l1.key < l2.key ? -1 : 1));

            // Ensure that elevation layers are by convention put at the start
            // of the layer list
            expect(map.getIndex(elev)).toEqual(0);

            expect(map.getIndex(d)).toEqual(1);
            expect(map.getIndex(a)).toEqual(2);
            expect(map.getIndex(c)).toEqual(3);
            expect(map.getIndex(b)).toEqual(4);
        });

        it('should signal the order change to tiles', () => {
            const tile = new Group();
            tile.isTileMesh = true;
            tile.reorderLayers = jest.fn();
            tile.layer = map;

            map.level0Nodes.push(tile);

            const a = mkColorLayer(2);
            const b = mkColorLayer(10);
            const c = mkColorLayer(6);
            const d = mkColorLayer(0);

            map._attachedLayers.push(a);
            map._attachedLayers.push(b);
            map._attachedLayers.push(c);
            map._attachedLayers.push(d);

            expect(tile.reorderLayers).not.toHaveBeenCalled();

            map.sortColorLayers((l1, l2) => (l1.key < l2.key ? -1 : 1));

            expect(tile.reorderLayers).toHaveBeenCalled();
        });
    });

    describe('moveLayerUp', () => {
        it('should throw if the layer is not present', () => {
            expect(() => map.moveLayerUp({})).toThrow(/layer is not present/);
        });

        it('should signal the order change to tiles', () => {
            const tile = new Group();
            tile.isTileMesh = true;
            tile.reorderLayers = jest.fn();
            tile.layer = map;

            map.level0Nodes.push(tile);

            const a = { id: 'a' };
            const b = { id: 'b' };
            const c = { id: 'c' };
            const d = { id: 'd' };

            map._attachedLayers.push(a);
            map._attachedLayers.push(b);
            map._attachedLayers.push(c);
            map._attachedLayers.push(d);

            expect(tile.reorderLayers).not.toHaveBeenCalled();

            map.moveLayerDown(b);

            expect(tile.reorderLayers).toHaveBeenCalled();
        });

        it('should move the layer one step to the foreground/top', () => {
            const a = { id: 'a' };
            const b = { id: 'b' };
            const c = { id: 'c' };
            const d = { id: 'd' };

            map._attachedLayers.push(a);
            map._attachedLayers.push(b);
            map._attachedLayers.push(c);
            map._attachedLayers.push(d);

            map.moveLayerUp(a);
            expect(map._attachedLayers).toStrictEqual([b, a, c, d]);
            checkLayerIndices();

            map.moveLayerUp(a);
            expect(map._attachedLayers).toStrictEqual([b, c, a, d]);
            checkLayerIndices();

            map.moveLayerUp(a);
            expect(map._attachedLayers).toStrictEqual([b, c, d, a]);
            checkLayerIndices();

            map.moveLayerUp(a);
            expect(map._attachedLayers).toStrictEqual([b, c, d, a]);
            checkLayerIndices();
        });
    });

    describe('moveLayerDown', () => {
        it('should throw if the layer is not present', () => {
            expect(() => map.moveLayerDown({})).toThrow(/layer is not present/);
        });

        it('should signal the order change to tiles', () => {
            const tile = new Group();
            tile.isTileMesh = true;
            tile.reorderLayers = jest.fn();
            tile.layer = map;

            map.level0Nodes.push(tile);

            const a = { id: 'a' };
            const b = { id: 'b' };
            const c = { id: 'c' };
            const d = { id: 'd' };

            map._attachedLayers.push(a);
            map._attachedLayers.push(b);
            map._attachedLayers.push(c);
            map._attachedLayers.push(d);

            expect(tile.reorderLayers).not.toHaveBeenCalled();

            map.moveLayerUp(b);

            expect(tile.reorderLayers).toHaveBeenCalled();
        });

        it('should move the layer one step to the foreground/top', () => {
            const a = { id: 'a' };
            const b = { id: 'b' };
            const c = { id: 'c' };
            const d = { id: 'd' };

            map._attachedLayers.push(a);
            map._attachedLayers.push(b);
            map._attachedLayers.push(c);
            map._attachedLayers.push(d);

            map.moveLayerDown(d);
            expect(map._attachedLayers).toStrictEqual([a, b, d, c]);
            checkLayerIndices();

            map.moveLayerDown(d);
            expect(map._attachedLayers).toStrictEqual([a, d, b, c]);
            checkLayerIndices();

            map.moveLayerDown(d);
            expect(map._attachedLayers).toStrictEqual([d, a, b, c]);
            checkLayerIndices();

            map.moveLayerDown(d);
            expect(map._attachedLayers).toStrictEqual([d, a, b, c]);
            checkLayerIndices();
        });
    });

    describe('loading', () => {
        it('should return false if no layer are present', () => {
            expect(map.loading).toEqual(false);
        });

        it('should return true if any layer is loading', async () => {
            const layer1 = new ElevationLayer('layer', { source: new NullSource({ extent }) });
            const layer2 = new ColorLayer('layer2', { source: new NullSource({ extent }) });

            let layer1Loading = false;
            let layer2Loading = false;

            Object.defineProperty(layer1, 'loading', {
                get: jest.fn(() => layer1Loading),
                set: jest.fn(),
            });

            Object.defineProperty(layer2, 'loading', {
                get: jest.fn(() => layer2Loading),
                set: jest.fn(),
            });

            await map.addLayer(layer1);
            await map.addLayer(layer2);

            layer1Loading = false;
            layer2Loading = false;
            expect(map.loading).toEqual(false);

            layer1Loading = false;
            layer2Loading = true;
            expect(map.loading).toEqual(true);

            layer1Loading = true;
            layer2Loading = false;
            expect(map.loading).toEqual(true);

            layer1Loading = true;
            layer2Loading = true;
            expect(map.loading).toEqual(true);
        });
    });

    describe('progress', () => {
        it('should return the average progress of all layers', async () => {
            const layer1 = new ElevationLayer('layer', { source: nullSource });
            const layer2 = new ColorLayer('layer2', { source: nullSource });

            let layer1Progress = 0;
            let layer2Progress = 0;

            Object.defineProperty(layer1, 'progress', {
                get: jest.fn(() => layer1Progress),
                set: jest.fn(),
            });

            Object.defineProperty(layer2, 'progress', {
                get: jest.fn(() => layer2Progress),
                set: jest.fn(),
            });

            await map.addLayer(layer1);
            await map.addLayer(layer2);

            layer1Progress = 0;
            layer2Progress = 0;
            expect(map.progress).toEqual(0);

            layer1Progress = 1;
            layer2Progress = 0;
            expect(map.progress).toEqual(0.5);

            layer1Progress = 1;
            layer2Progress = 1;
            expect(map.progress).toEqual(1);

            layer1Progress = 0.25;
            layer2Progress = 0.75;
            expect(map.progress).toEqual(0.5);
        });
    });

    describe('getElevationMinMax', () => {
        it('should return {0, 0} if no elevation layer is present', () => {
            const { min, max } = map.getElevationMinMax();

            expect(min).toEqual(0);
            expect(max).toEqual(0);
        });

        it('should return the min/max value of the elevation layer if present', async () => {
            const layer = new ElevationLayer('layer', { source: nullSource });
            layer.minmax = { min: -123, max: 555 };

            await map.addLayer(layer);

            const { min, max } = map.getElevationMinMax();

            expect(min).toEqual(-123);
            expect(max).toEqual(555);
        });

        it('should return {0, 0} if an elevation layer is present, but has no minmax', async () => {
            const layer = new ElevationLayer('layer', { source: new NullSource() });
            layer.minmax = null;

            map.addLayer(layer);

            const { min, max } = map.getElevationMinMax();

            expect(min).toEqual(0);
            expect(max).toEqual(0);
        });

        it('should return the computed min/max value of all elevation layers', async () => {
            const layer1 = new ElevationLayer('layer1', { source: nullSource });
            const layer2 = new ElevationLayer('layer2', { source: nullSource });

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
        it('should not call dispose() on the removed layer', async () => {
            const layer = new Layer('layer', { source: nullSource });
            layer.dispose = jest.fn();
            layer.whenReady = Promise.resolve();

            await map.addLayer(layer);

            map.removeLayer(layer);

            expect(layer.dispose).not.toHaveBeenCalled();
        });

        it('should call dispose() on the removed layer if disposeLayer = true', async () => {
            const layer = new Layer('layer', { source: nullSource });
            layer.dispose = jest.fn();
            layer.whenReady = Promise.resolve();

            await map.addLayer(layer);

            map.removeLayer(layer, { disposeLayer: true });

            expect(layer.dispose).toHaveBeenCalled();
        });

        it('should fire the layer-removed event', async () => {
            const layer = new Layer('layer', { source: nullSource });
            layer.dispose = jest.fn();
            layer.whenReady = Promise.resolve();

            const listener = jest.fn();

            await map.addLayer(layer);

            map.addEventListener('layer-removed', listener);

            map.removeLayer(layer);

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should return true if the layer was present', async () => {
            const layer = new Layer('layer', { source: nullSource });
            layer.dispose = jest.fn();
            layer.whenReady = Promise.resolve();

            await map.addLayer(layer);

            expect(map.removeLayer(layer)).toBeTruthy();
            expect(map.removeLayer(layer)).toBeFalsy();
        });
    });

    describe('dispose', () => {
        it('should not call dispose on underlying layers', async () => {
            const layer1 = new Layer('layer1', { source: new NullSource() });
            layer1.dispose = jest.fn();
            layer1.whenReady = Promise.resolve();

            const layer2 = new Layer('layer2', { source: nullSource });
            layer2.whenReady = Promise.resolve();
            layer2.dispose = jest.fn();

            await map.addLayer(layer1);
            await map.addLayer(layer2);

            map.dispose();

            expect(layer1.dispose).not.toHaveBeenCalledTimes(1);
            expect(layer2.dispose).not.toHaveBeenCalledTimes(1);
        });

        it('should call dispose on underlying layers if disposeLayers = true', async () => {
            const layer1 = new Layer('layer1', { source: new NullSource() });
            layer1.dispose = jest.fn();
            layer1.whenReady = Promise.resolve();

            const layer2 = new Layer('layer2', { source: nullSource });
            layer2.whenReady = Promise.resolve();
            layer2.dispose = jest.fn();

            await map.addLayer(layer1);
            await map.addLayer(layer2);

            map.dispose({ disposeLayers: true });

            expect(layer1.dispose).toHaveBeenCalledTimes(1);
            expect(layer2.dispose).toHaveBeenCalledTimes(1);
        });

        it('should dispose all tiles', () => {
            const tile1 = new Object3D();
            const tile2 = new Object3D();
            tile1.isTileMesh = true;
            tile2.isTileMesh = true;
            tile1.dispose = jest.fn();
            tile2.dispose = jest.fn();

            map.level0Nodes.push(tile1);
            map.level0Nodes.push(tile2);

            map.dispose();

            expect(tile1.dispose).toHaveBeenCalledTimes(1);
            expect(tile2.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('renderOrder', () => {
        describe('get', () => {
            it('should return the correct default value', () => {
                expect(map.renderOrder).toEqual(0);
            });

            it('should return the assigned value', () => {
                map.renderOrder = 99;

                expect(map.renderOrder).toEqual(99);
            });
        });

        describe('set', () => {
            it('should set the renderOrder property of all tiles', () => {
                expect(map.level0Nodes.length).toBeGreaterThan(0);

                map.level0Nodes.forEach(n => {
                    expect(n.renderOrder).toEqual(0);
                });

                map.renderOrder = 99;

                map.level0Nodes.forEach(n => {
                    expect(n.renderOrder).toEqual(99);
                });
            });
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
