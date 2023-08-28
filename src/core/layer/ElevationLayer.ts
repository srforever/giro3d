import { FloatType, Texture } from 'three';
import Interpretation from './Interpretation.js';
import Layer, { TextureAndPitch } from './Layer';
import ColorMap from './ColorMap.js';
import Extent from '../geographic/Extent.js';
import ImageSource from '../../sources/ImageSource.js';
import TileMesh from '../TileMesh.js';
import LayeredMaterial from '../../renderer/LayeredMaterial.js';
import ElevationRange from '../ElevationRange.js';

interface TextureWithMinMax extends Texture {
    min?: number;
    max?: number;
}

/**
 * A layer that provides elevation data to display terrains.
 */
class ElevationLayer extends Layer {
    minmax: ElevationRange;
    readonly isElevationLayer: boolean = true;

    /**
     * Creates an elevation layer.
     * See the example for more information on layer creation.
     *
     * @param id The unique identifier of the layer.
     * @param options The layer options.
     * @param options.source The data source of this layer.
     * @param options.interpretation How to interpret the
     * values in the dataset.
     * @param options.extent The geographic extent of the layer. If unspecified,
     * the extent will be inherited from the source. Note: for performance reasons, it is highly
     * recommended to specify an extent when the source is much bigger than the map(s) that host
     * this layer.
     * @param options.minmax The minimal/maximal elevation values of this layer.
     * If unspecified, the layer will attempt to compute an approximation using downsampled data.
     * @param options.noDataValue the optional no-data value to pass to the source.
     * Any pixel that matches this value will not be processed.
     * @param options.preloadImages Enables or disable preloading of low resolution fallback images.
     * @param options.colorMap An optional color map for this layer.
     */
    constructor(id: string, options: {
        source: ImageSource;
        interpretation?: Interpretation;
        extent?: Extent;
        preloadImages: boolean,
        minmax?: ElevationRange;
        noDataValue?: number;
        colorMap?: ColorMap;
    }) {
        super(id, {
            fillNoData: true,
            computeMinMax: true,
            // If min/max is not provided, we *have* to preload images
            // to compute the min/max during preprocessing.
            preloadImages: options.preloadImages ?? options.minmax == null,
            ...options,
        });

        if (options.minmax) {
            this.minmax = options.minmax;
        } else {
            this.minmax = { min: 0, max: 0 };
        }
        this.type = 'ElevationLayer';
    }

    // eslint-disable-next-line class-methods-use-this
    protected getRenderTargetDataType() {
        return FloatType;
    }

    protected adjustExtent(extent: Extent) {
        // If we know the extent of the source/layer, we can additionally
        // crop the margin extent to ensure it does not overflow the layer extent.
        // This is necessary for elevation layers as they do not use an atlas.
        const thisExtent = this.getExtent();
        if (thisExtent && extent.intersectsExtent(thisExtent)) {
            extent.intersect(thisExtent);
        }

        return extent;
    }

    protected async onInitialized() {
        // Compute a min/max approximation using the background images that
        // are already present on the composer.
        if (!this.minmax) {
            const { min, max } = this.composer.getMinMax(this.getExtent());
            this.minmax = { min, max };
        }
    }

    protected registerNode(node: TileMesh) {
        const material = node.material;
        if (Array.isArray(material)) {
            material.forEach(m => (m as LayeredMaterial).pushElevationLayer(this));
        } else {
            (material as LayeredMaterial).pushElevationLayer(this);
        }
    }

    protected unregisterNode(node: TileMesh) {
        super.unregisterNode(node);
        const material = node.material;
        if (Array.isArray(material)) {
            material.forEach(m => (m as LayeredMaterial).removeElevationLayer());
        } else {
            (material as LayeredMaterial).removeElevationLayer();
        }
    }

    protected getMinMax(texture: TextureWithMinMax) {
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

    protected applyTextureToNode(
        textureAndPitch: TextureAndPitch,
        node: TileMesh,
        isLastRender: boolean,
    ) {
        const { texture, pitch } = textureAndPitch;
        const { min, max } = this.getMinMax(texture);

        const value = {
            texture, pitch, min, max,
        };
        node.setElevationTexture(this, value, isLastRender);
    }

    protected applyEmptyTextureToNode(node: TileMesh) {
        node.removeElevationTexture(this);
    }
}

export default ElevationLayer;
