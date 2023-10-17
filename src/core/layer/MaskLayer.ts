import { Texture, Vector4 } from 'three';
import ColorLayer from './ColorLayer';
import type { Node, NodeMaterial } from './Layer';
import type { ImageSource } from '../../sources';
import type { Extent } from '../geographic';

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

/**
 * A {@link ColorLayer} that can be used to mask parts of
 * a map. The source can be any source supported by the color layers.
 *
 */
class MaskLayer extends ColorLayer {
    private _maskMode: MaskMode;
    readonly isMaskLayer: boolean = true;

    /**
     * Creates a mask layer.
     * It should be added in a {@link module:entities/Map~Map Map} to be displayed in the instance.
     * See the example for more information on layer creation.
     *
     * @param id The unique identifier of the layer.
     * @param options The layer options.
     * @param options.source The data source of this layer.
     * @param options.extent The geographic extent of the layer. If
     * unspecified, the extent will be inherited from the map.
     * @param options.maskMode The mask mode.
     */
    constructor(id: string, options: {
        source: ImageSource;
        extent?: Extent;
        maskMode?: MaskMode;
    }) {
        super(id, options);
        this.isMaskLayer = true;
        this.type = 'MaskLayer';
        this._maskMode = options.maskMode || MaskMode.Normal;
    }

    /**
     * Gets or set the mask mode.
     *
     * @type {MaskMode}
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
