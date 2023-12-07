import Layer, {
    type LayerOptions,
    type LayerEvents,
    type Node,
    type NodeMaterial,
    type TextureAndPitch,
} from './Layer';
import type Extent from '../geographic/Extent';
import type ElevationRange from '../ElevationRange';
import OutputMode from './OutputMode';

export interface ColorLayerEvents extends LayerEvents {
    'opacity-property-changed': { opacity: number; };
    'brightness-property-changed': { brightness: number; };
    'contrast-property-changed': { contrast: number; };
    'saturation-property-changed': { saturation: number; };
}

export interface ColorLayerOptions extends LayerOptions {
    /**
     * An optional elevation range to limit the display of this layer.
     * This is only useful if there is also an elevation layer on the map.
     */
    elevationRange?: ElevationRange;
    /**
     * The opacity of the layer. Default is 1 (opaque).
     */
    opacity?: number;
}

/**
 * A layer that produces color images, such as vector data, or satellite imagery.
 */
class ColorLayer extends Layer<ColorLayerEvents> {
    private _opacity: number;
    /**
     * Read-only flag to check if a given object is of type ColorLayer.
     */
    readonly isColorLayer: boolean = true;
    readonly elevationRange: ElevationRange;
    private _brightness: number;
    private _contrast: number;
    private _saturation: number;

    /**
     * Creates a color layer.
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
     * this layer, and when `preloadImages` is `true`. Note: this extent must be in the same CRS as
     * the instance.
     * @param options.showTileBorders If `true`, the borders of the source images
     * will be shown. Useful for debugging rendering issues.
     * @param options.elevationRange An optional elevation range to limit the
     * display of this layer. This is only useful if there is an elevation layer on the map.
     * @param options.preloadImages Enables or disable preloading of low resolution fallback images.
     */
    constructor(id: string, options: ColorLayerOptions) {
        super(id, { outputMode: OutputMode.Color, ...options });
        this.type = 'ColorLayer';
        this.elevationRange = options.elevationRange;
        this._opacity = options.opacity ?? 1;
        this._brightness = 0;
        this._contrast = 1;
        this._saturation = 1;
    }

    /**
     * Gets or sets the opacity of this layer.
     *
     *  @fires ColorLayer#opacity-property-changed
     */
    get opacity() {
        return this._opacity;
    }

    set opacity(v) {
        if (this._opacity !== v) {
            this._opacity = v;
            this.dispatchEvent({ type: 'opacity-property-changed', opacity: v });
        }
    }

    /**
     * Gets or sets the brightness of this layer.
     *
     *  @fires ColorLayer#brightness-property-changed
     */
    get brightness() {
        return this._brightness;
    }

    set brightness(v) {
        if (this._brightness !== v) {
            this._brightness = v;
            this.dispatchEvent({ type: 'brightness-property-changed', brightness: v });
        }
    }

    /**
     * Gets or sets the contrast of this layer.
     *
     *  @fires ColorLayer#contrast-property-changed
     */
    get contrast() {
        return this._contrast;
    }

    set contrast(v) {
        if (this._contrast !== v) {
            this._contrast = v;
            this.dispatchEvent({ type: 'contrast-property-changed', contrast: v });
        }
    }

    /**
     * Gets or sets the saturation of this layer.
     *
     *  @fires ColorLayer#saturation-property-changed
     */
    get saturation() {
        return this._saturation;
    }

    set saturation(v) {
        if (this._saturation !== v) {
            this._saturation = v;
            this.dispatchEvent({ type: 'saturation-property-changed', saturation: v });
        }
    }

    protected updateMaterial(material: NodeMaterial) {
        if (material.hasColorLayer(this)) {
            // Update material parameters
            material.setLayerVisibility(this, this.visible);
            material.setLayerOpacity(this, this.opacity);
            material.setLayerElevationRange(this, this.elevationRange);
            material.setLayerBrightnessContrastSaturation(
                this,
                this.brightness,
                this.contrast,
                this.saturation,
            );
        }
    }

    registerNode(node: Node, extent: Extent) {
        (node.material as NodeMaterial).pushColorLayer(this, extent);
    }

    unregisterNode(node: Node) {
        super.unregisterNode(node);
        const material = node.material as NodeMaterial;
        if (material) {
            if (material.indexOfColorLayer(this) !== -1) {
                material.removeColorLayer(this);
            }
        }
    }

    protected applyTextureToNode(result: TextureAndPitch, node: Node) {
        (node.material as NodeMaterial).setColorTextures(this, result);
    }

    protected applyEmptyTextureToNode(node: Node) {
        (node.material as NodeMaterial).removeColorLayer(this);
    }
}

export default ColorLayer;
