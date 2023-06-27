/**
 * @module core/layer/MaskLayer
 */

import { Texture, Vector4 } from 'three';
import ColorLayer from './ColorLayer.js';
import ImageSource from '../../sources/ImageSource.js';

/**
 * Modes of the mask layer.
 *
 * @api
 * @enum
 */
const MaskMode = {
    /**
     * The mask is applied normally: transparents parts of the mask make the map transparent.
     *
     * @api
     * @type {number}
     */
    Normal: 1,
    /**
     * The mask is inverted: transparents parts of the mask make the map opaque.
     *
     * @api
     * @type {number}
     */
    Inverted: 2,
};

const EMPTY_TEXTURE = new Texture();
const DEFAULT_PITCH = new Vector4(0, 0, 1, 1);

/**
 * A {@link module:core/layer/ColorLayer~ColorLayer ColorLayer} that can be used to mask parts of
 * a map. The source can be any source supported by the color layers.
 *
 * @api
 */
class MaskLayer extends ColorLayer {
    /**
     * Creates a mask layer.
     * It should be added in a {@link module:entities/Map~Map Map} to be displayed in the instance.
     * See the example for more information on layer creation.
     *
     * @param {string} id The unique identifier of the layer.
     * @param {object} options The layer options.
     * @param {ImageSource} options.source The data source of this layer.
     * @param {object} [options.extent=undefined] The geographic extent of the layer. If
     * unspecified, the extent will be inherited from the map.
     * @param {string} [options.projection=undefined] The layer projection. If unspecified,
     * the projection will be inherited from the map.
     * @param {MaskMode} options.maskMode The mask mode.
     */
    constructor(id, options) {
        super(id, options);
        this.type = 'MaskLayer';
        this._maskMode = options.maskMode || MaskMode.Normal;
    }

    /**
     * Gets or set the mask mode.
     *
     * @api
     * @type {MaskMode}
     */
    get maskMode() {
        return this._maskMode;
    }

    set maskMode(v) {
        this._maskMode = v;
    }

    applyEmptyTextureToNode(node) {
        // We cannot remove the layer from the material, contrary to what is done for
        // other layer types, because since this layer acts as a mask, it must be defined
        // for the entire map.
        node.material.setColorTextures(this, { texture: EMPTY_TEXTURE, pitch: DEFAULT_PITCH });
    }
}

export default MaskLayer;

export {
    MaskMode,
};
