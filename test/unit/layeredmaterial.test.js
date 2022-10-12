import assert from 'assert';
import LayerUpdateState from '../../src/Core/layer/LayerUpdateState.js';
import ColorLayer from '../../src/Core/layer/ColorLayer.js';

describe('material state vs layer state', () => {
    let opacity;
    let visible;

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
        },
    };
    const layer = new ColorLayer(
        'test',
        {
            visible: true,
            opacity: 1.0,
            standalone: true,
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
});
