/**
 * @module core/layer/MaskLayer
 */

import ColorLayer from './ColorLayer.js';

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
     * @param {
     * module:ol~TileImage |
     * module:ol~Vector |
     * module:ol~VectorTile |
     * module:sources/CogSource~CogSource|
     * module:sources/CustomTiledImageSource~CustomTiledImageSource} options.source
     * The data source of this layer.
     * @param {object} [options.extent=undefined] The geographic extent of the layer. If
     * unspecified, the extent will be inherited from the map.
     * @param {string} [options.projection=undefined] The layer projection. If unspecified,
     * the projection will be inherited from the map.
     * @param {MaskMode} options.maskMode The max value.
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
}

export default MaskLayer;

export {
    MaskMode,
};
