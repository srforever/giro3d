/**
 * @module core/layer/ElevationLayer
 */
import { FloatType } from 'three';
import Interpretation from './Interpretation.js';
import Layer from './Layer.js';
import ColorMap from './ColorMap.js';
import Extent from '../geographic/Extent.js';
import ImageSource from '../../sources/ImageSource.js';

/**
 * A layer that provides elevation data to display terrains.
 *
 * @api
 */
class ElevationLayer extends Layer {
    /**
     * Creates an elevation layer.
     * It should be added in {@link module:entities/Map~Map Maps} to be displayed in the instance.
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
     * @param {object} [options.minmax] The minimal/maximal elevation values of this layer.
     * If unspecified, the layer will attempt to compute an approximation using downsampled data.
     * @param {number} [options.minmax.min] The minimal elevation of this layer.
     * @param {number} [options.minmax.max] The maximal elevation of this layer.
     * @param {number} [options.noDataValue=undefined] the optional no-data value to pass to the
     * source. Any pixel that matches this value will not be processed.
     * @param {ColorMap} [options.colorMap=undefined] An optional color map for this layer.
     */
    constructor(id, options = {}) {
        super(id, {
            fillNoData: true,
            computeMinMax: { noDataValue: options.noDataValue },
            ...options,
        });

        if (options.noDataValue) {
            this.noDataValue = options.noDataValue;
        }
        if (options.minmax) {
            this.minmax = options.minmax;
        } else {
            this.minmax = null;
        }
        this.type = 'ElevationLayer';
    }

    // eslint-disable-next-line class-methods-use-this
    getRenderTargetDataType() {
        return FloatType;
    }

    adjustExtent(extent) {
        // If we know the extent of the source/layer, we can additionally
        // crop the margin extent to ensure it does not overflow the layer extent.
        // This is necessary for elevation layers as they do not use an atlas.
        const thisExtent = this.getExtent();
        if (thisExtent && extent.intersectsExtent(thisExtent)) {
            extent.intersect(thisExtent);
        }

        return extent;
    }

    async onInitialized() {
        // Compute a min/max approximation using the background images that
        // are already present on the composer.
        if (!this.minmax) {
            const { min, max } = this.composer.getMinMax(this.getExtent());
            this.minmax = { min, max };
        }
    }

    registerNode(node) {
        super.registerNode(node);
        node.material.pushElevationLayer(this);
    }

    unregisterNode(node) {
        super.unregisterNode(node);
        const material = node.material;
        if (material) {
            node.material.removeElevationLayer(this);
        }
    }

    getMinMax(texture) {
        if (this.minmax == null) {
            this.minmax = { min: texture.min, max: texture.max };
        }
        const min = Number.isFinite(texture.min) ? texture.min : this.minmax.min;
        const max = Number.isFinite(texture.max) ? texture.max : this.minmax.max;
        // Refine the min/max values using the new texture.
        this.minmax.min = Math.min(min, this.minmax.min);
        this.minmax.max = Math.max(max, this.minmax.max);

        return { min, max };
    }

    applyTextureToNode(textureAndPitch, node, isLastRender) {
        const { texture, pitch } = textureAndPitch;
        const { min, max } = this.getMinMax(texture);

        const value = {
            texture, pitch, min, max,
        };
        node.setElevationTexture(this, value, isLastRender);
    }

    applyEmptyTextureToNode(node) {
        node.removeElevationTexture(this);
    }
}

export default ElevationLayer;
