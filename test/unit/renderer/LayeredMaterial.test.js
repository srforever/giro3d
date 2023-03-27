import assert from 'assert';
import { DoubleSide, FrontSide } from 'three';
import LayerUpdateState from '../../../src/core/layer/LayerUpdateState.js';
import ColorLayer from '../../../src/core/layer/ColorLayer.js';
import LayeredMaterial from '../../../src/renderer/LayeredMaterial.js';

const defaultAtlasInfo = { minX: 0, maxX: 1 };
const defaultRenderer = {};

describe('LayeredMaterial', () => {
    describe('constructor', () => {
        it('should assign the correct side', () => {
            const normal = new LayeredMaterial({
                options: {},
                renderer: defaultRenderer,
                atlasInfo: defaultAtlasInfo,
            });
            const ds = new LayeredMaterial({
                options: { doubleSided: true },
                renderer: defaultRenderer,
                atlasInfo: defaultAtlasInfo,
            });

            expect(ds.side).toBe(DoubleSide);
            expect(normal.side).toBe(FrontSide);
        });
    });
});

describe('material state vs layer state', () => {
    let opacity;
    let visible;
    let range;

    const node = {
        parent: { },
        layerUpdateState: {
            test: new LayerUpdateState(),
        },
        getExtentForLayer: () => undefined,
        material: {
            visible: true,
            pushLayer: () => {},
            indexOfColorLayer: () => 0,
            setLayerVisibility: (idx, v) => { visible = v; },
            setLayerOpacity: (idx, o) => { opacity = o; },
            setLayerElevationRange: (idx, v) => { range = v; },
        },
    };
    const layer = new ColorLayer(
        'test',
        {
            visible: true,
            opacity: 1.0,
            standalone: true,
            elevationRange: { min: 12, max: 32342 },
        },
    );

    beforeEach(() => {
        layer.ready = true;
    });

    it('should correctly initialize opacity & visibility', () => {
        node.layerUpdateState.test.failure(new Date());
        layer.update(null, node);
        assert.equal(opacity, layer.opacity);
        assert.equal(visible, layer.visible);
    });
    it('should update material opacity & visibility', () => {
        layer.opacity = 0.5;
        layer.visible = false;
        layer.update(null, node);
        assert.equal(opacity, layer.opacity);
        assert.equal(visible, layer.visible);
    });
    it('should update material opacity & visibility even if layer is cannot be updated', () => {
        node.layerUpdateState.test.noMoreUpdatePossible();
        layer.opacity = 0.75;
        layer.update(null, node);
        assert.equal(opacity, layer.opacity);
        assert.equal(visible, layer.visible);
    });
    it('should update elevation range', () => {
        layer.update(null, node);
        assert.equal(range, layer.elevationRange);
    });
});
