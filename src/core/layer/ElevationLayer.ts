import type { PixelFormat, Texture, TextureDataType } from 'three';
import { FloatType, NoColorSpace, RGFormat } from 'three';
import type { LayerEvents, LayerOptions, LayerUserData, Target, TextureAndPitch } from './Layer';
import Layer from './Layer';
import type Extent from '../geographic/Extent.js';
import type TileMesh from '../TileMesh';
import type LayeredMaterial from '../../renderer/LayeredMaterial';
import type ElevationRange from '../ElevationRange.js';

interface TextureWithMinMax extends Texture {
    min?: number;
    max?: number;
}

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
class ElevationLayer<UserData extends LayerUserData = LayerUserData> extends Layer<
    LayerEvents,
    UserData
> {
    minmax: ElevationRange;
    /**
     * Read-only flag to check if a given object is of type ElevationLayer.
     */
    readonly isElevationLayer: boolean = true;

    /**
     * Creates an elevation layer.
     * See the example for more information on layer creation.
     *
     * @param options - The layer options.
     */
    constructor(options: ElevationLayerOptions) {
        super({
            noDataOptions: options.noDataOptions ?? {
                replaceNoData: false,
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
    getRenderTargetDataType(): TextureDataType {
        return FloatType;
    }

    // eslint-disable-next-line class-methods-use-this
    getRenderTargetPixelFormat(): PixelFormat {
        // Elevation textures need two channels:
        // - The elevation values
        // - A bitmask to indicate no-data values
        // The closest format that suits those needs is the RGFormat,
        // although we have to be aware that the bitmask is not located
        // in the alpha channel, but in the green channel.
        return RGFormat;
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
            const { min, max } = this._composer.getMinMax(this.getExtent());
            this.minmax = { min, max };
        }
    }

    // eslint-disable-next-line class-methods-use-this
    protected canFetchImages(): boolean {
        return true;
    }

    registerNode(node: TileMesh) {
        node.material.pushElevationLayer(this);
    }

    unregisterNode(node: TileMesh) {
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
        target: Target,
        isLastRender: boolean,
    ) {
        const { texture, pitch } = textureAndPitch;
        const { min, max } = this.getMinMax(texture);

        const value = {
            texture,
            pitch,
            min,
            max,
        };

        const node = target.node as TileMesh;
        node.setElevationTexture(
            this,
            { ...value, renderTarget: target.renderTarget },
            isLastRender,
        );
    }

    // eslint-disable-next-line class-methods-use-this
    protected applyEmptyTextureToNode(node: TileMesh) {
        node.removeElevationTexture();
    }

    // eslint-disable-next-line class-methods-use-this
    protected onTextureCreated(texture: Texture): void {
        // Elevation textures not being color textures, they must not be
        // subjected to colorspace transformations that would alter their values.
        // See https://threejs.org/docs/#manual/en/introduction/Color-management
        texture.colorSpace = NoColorSpace;
    }
}

/**
 * Returns `true` if the given object is a {@link ElevationLayer}.
 */
export function isElevationLayer(obj: unknown): obj is ElevationLayer {
    return typeof obj === 'object' && (obj as ElevationLayer)?.isElevationLayer;
}

export default ElevationLayer;
