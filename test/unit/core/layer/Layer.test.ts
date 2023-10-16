import type { Node, TextureAndPitch } from 'src/core/layer/Layer';
import Layer from 'src/core/layer/Layer';
import Extent from 'src/core/geographic/Extent';
import NullSource from 'src/sources/NullSource';
import type RequestQueue from 'src/core/RequestQueue';
import { setupGlobalMocks } from '../../mocks.js';

class TestLayer extends Layer {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, class-methods-use-this
    protected registerNode(_node: Node, _extent: Extent): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, class-methods-use-this
    protected applyTextureToNode(_texture: TextureAndPitch, _node: Node, _isLastRender: boolean)
        : void {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, class-methods-use-this
    protected applyEmptyTextureToNode(_node: Node): void {
    }

    getQueue(): RequestQueue {
        return this.queue;
    }
}

describe('Layer', () => {
    beforeEach(() => {
        setupGlobalMocks();
    });

    describe('progress & loading', () => {
        it('should return the progress and loading of the underlying queue', () => {
            const layer = new TestLayer('foo', { source: new NullSource() });

            expect(layer.progress).toBe(layer.getQueue().progress);
            expect(layer.loading).toBe(layer.getQueue().loading);
        });
    });

    describe('dispose', () => {
        it('should dispose the source', () => {
            const source = new NullSource();
            source.dispose = jest.fn();
            const layer = new TestLayer('foo', { source });

            expect(source.dispose).not.toHaveBeenCalled();

            layer.dispose();

            expect(source.dispose).toHaveBeenCalled();
        });
    });

    describe('constructor', () => {
        it('should assign the provided properties', () => {
            const id = 'foo';
            const extent = new Extent('EPSG:4326', 0, 0, 0, 0);
            const layer = new TestLayer(id, {
                extent,
                source: new NullSource(),
            });

            expect(layer.id).toEqual(id);
            expect(layer.extent).toEqual(extent);
        });

        it('should not accept all sources', () => {
            expect(() => new TestLayer('id', { source: null })).toThrowError(/missing or invalid source/);
        });
    });

    describe('visible', () => {
        it('should return the correct value', () => {
            const layer = new TestLayer('foo', { source: new NullSource() });

            expect(layer.visible).toEqual(true);

            layer.visible = false;
            expect(layer.visible).toEqual(false);
        });

        it('should raise the visible-property-changed event', () => {
            const layer = new TestLayer('foo', { source: new NullSource() });

            const listener = jest.fn();
            layer.addEventListener('visible-property-changed', listener);

            expect(listener).not.toHaveBeenCalled();

            layer.visible = false;
            layer.visible = false;
            layer.visible = false;

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });
});
