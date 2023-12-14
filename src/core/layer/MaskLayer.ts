import { Texture, Vector4 } from 'three';
import ColorLayer from './ColorLayer';
import type { LayerOptions, Node, NodeMaterial } from './Layer';

/**
 * Modes of the mask layer.
 */
enum MaskMode {
    /**
     * The mask is applied normally: transparents parts of the mask make the map transparent.
     */
    Normal = 1,
    /**
     * The mask is inverted: transparents parts of the mask make the map opaque.
     */
    Inverted = 2,
}

const EMPTY_TEXTURE = new Texture();
const DEFAULT_PITCH = new Vector4(0, 0, 1, 1);

export interface MaskLayerOptions extends LayerOptions {
    /**
     * How to interpret the mask.
     */
    maskMode?: MaskMode;
}

/**
 * A {@link ColorLayer} that can be used to mask parts of
 * a map. The source can be any source supported by the color layers.
 *
 */
class MaskLayer extends ColorLayer {
    private _maskMode: MaskMode;
    /**
     * Read-only flag to check if a given object is of type MaskLayer.
     */
    readonly isMaskLayer: boolean = true;

    /**
     * Creates a mask layer.
     * It should be added in a `Map` to be displayed in the instance.
     * See the example for more information on layer creation.
     *
     * @param options The layer options.
     */
    constructor(options: MaskLayerOptions) {
        super(options);
        this.isMaskLayer = true;
        this.type = 'MaskLayer';
        this._maskMode = options.maskMode || MaskMode.Normal;
    }

    /**
     * Gets or set the mask mode.
     */
    get maskMode() {
        return this._maskMode;
    }

    set maskMode(v) {
        this._maskMode = v;
    }

    applyEmptyTextureToNode(node: Node) {
        // We cannot remove the layer from the material, contrary to what is done for
        // other layer types, because since this layer acts as a mask, it must be defined
        // for the entire map.
        (node.material as NodeMaterial).setColorTextures(this, {
            texture: EMPTY_TEXTURE,
            pitch: DEFAULT_PITCH,
        });
    }
}

export default MaskLayer;

export {
    MaskMode,
};
