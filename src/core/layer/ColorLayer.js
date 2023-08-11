/**
 * @module core/layer/ColorLayer
 */

import Layer from './Layer.js';
import EventUtils from '../../utils/EventUtils.js';
import ImageSource from '../../sources/ImageSource.js';
import Extent from '../geographic/Extent.js';
import Interpretation from './Interpretation.js';

/**
 * A layer that produces color images, such as vector data, or satellite imagery.
 *
 * @property {number} [opacity=1.0] The opacity of this ColorLayer. Note: this only affects color
 * mixing between ColorLayers, not the opacity of the Entity this layer is attached to.
 * @api
 */
class ColorLayer extends Layer {
    /**
     * Creates a color layer.
     * It should be added in a {@link module:entities/Map~Map Map} to be displayed in the instance.
     * See the example for more information on layer creation.
     *
     * @param {string} id The unique identifier of the layer.
     * @param {object} options The layer options.
     * @param {ImageSource} options.source The data source of this layer.
     * @param {Interpretation} [options.interpretation=Interpretation.Raw] How to interpret the
     * values in the dataset.
     * @param {Extent} [options.extent] The geographic extent of the layer. If unspecified,
     * the extent will be inherited from the source. Note: for performance reasons, it is highly
     * recommended to specify an extent when the source is much bigger than the map(s) that host
     * this layer.
     * @param {boolean} [options.showTileBorders=false] If `true`, the borders of the source images
     * will be shown. Useful for debugging rendering issues.
     * @param {object} [options.elevationRange=undefined] An optional elevation range to limit the
     * display of this layer. This is only useful if there is an elevation layer on the map.
     * @param {number} options.elevationRange.min The min value.
     * @param {number} options.elevationRange.max The max value.
     */
    constructor(id, options = {}) {
        super(id, options);
        this.type = 'ColorLayer';
        this.elevationRange = options.elevationRange;
        this._opacity = 1;
    }

    /**
     * Gets or sets the opacity of this layer.
     *
     * @api
     * @type {number}
     * @fires ColorLayer#opacity-property-changed
     */
    get opacity() {
        return this._opacity;
    }

    set opacity(v) {
        if (this._opacity !== v) {
            const event = EventUtils.createPropertyChangedEvent(this, 'opacity', this._opacity, v);
            this._opacity = v;
            this.dispatchEvent(event);
        }
    }

    updateMaterial(material) {
        if (material.hasColorLayer(this)) {
            // Update material parameters
            material.setLayerVisibility(this, this.visible);
            material.setLayerOpacity(this, this.opacity);
            material.setLayerElevationRange(this, this.elevationRange);
        }
    }

    registerNode(node, extent) {
        node.material.pushColorLayer(this, extent);
    }

    unregisterNode(node) {
        super.unregisterNode(node);
        const material = node.material;
        if (material) {
            if (material.indexOfColorLayer(this) !== -1) {
                node.material.removeColorLayer(this);
            }
        }
    }

    applyTextureToNode(result, node) {
        node.material.setColorTextures(this, result);
    }

    applyEmptyTextureToNode(node) {
        node.material.removeColorLayer(this);
    }
}

export default ColorLayer;
