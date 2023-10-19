import type { Texture } from 'three';
import { FloatType } from 'three';
import type { LayerEvents, LayerOptions, TextureAndPitch } from './Layer';
import Layer from './Layer';
import type Extent from '../geographic/Extent.js';
import type ImageSource from '../../sources/ImageSource.js';
import type TileMesh from '../TileMesh';
import type LayeredMaterial from '../../renderer/LayeredMaterial';
import type ElevationRange from '../ElevationRange.js';

interface TextureWithMinMax extends Texture {
    min?: number;
    max?: number;
}

interface ElevationLayerEvents extends LayerEvents {}

export interface ElevationLayerOptions extends LayerOptions {
    /**
     * The minimal/maximal elevation values of this layer.
     * If unspecified, the layer will attempt to compute an approximation using downsampled data.
     */
    minmax?: ElevationRange;
}

/**
 * A layer that provides elevation data to display terrains.
 */
class ElevationLayer extends Layer<ElevationLayerEvents> {
    minmax: ElevationRange;
    /**
     * Read-only flag to check if a given object is of type ElevationLayer.
     */
    readonly isElevationLayer: boolean = true;

    /**
     * Creates an elevation layer.
     * See the example for more information on layer creation.
     *
     * @param id The unique identifier of the layer.
     * @param options The layer options.
     */
    constructor(id: string, options: ElevationLayerOptions) {
        super(id, {
            noDataOptions: options.noDataOptions ?? {
                replaceNoData: true,
                maxSearchDistance: +Infinity,
                alpha: 0,
            },
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

    // eslint-disable-next-line class-methods-use-this
    protected applyEmptyTextureToNode(node: TileMesh) {
        node.removeElevationTexture();
    }
}

export default ElevationLayer;
