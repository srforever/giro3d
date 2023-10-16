import type { Node, NodeMaterial, TextureAndPitch } from './Layer';
import Layer from './Layer';
import EventUtils from '../../utils/EventUtils.js';
import type ImageSource from '../../sources/ImageSource.js';
import type Interpretation from './Interpretation';
import type Extent from '../geographic/Extent';
import type ElevationRange from '../ElevationRange';

/**
 * A layer that produces color images, such as vector data, or satellite imagery.
 */
class ColorLayer extends Layer {
    private _opacity: number;
    readonly isColorLayer: boolean = true;
    private readonly elevationRange: ElevationRange;

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
    constructor(id: string, options: {
        source: ImageSource;
        interpretation?: Interpretation;
        extent?: Extent;
        showTileBorders?: boolean;
        preloadImages?:boolean;
        elevationRange?: ElevationRange;
    }) {
        super(id, options);
        this.isColorLayer = true;
        this.type = 'ColorLayer';
        this.elevationRange = options.elevationRange;
        this._opacity = 1;
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
            const event = EventUtils.createPropertyChangedEvent(this, 'opacity', this._opacity, v);
            this._opacity = v;
            this.dispatchEvent(event);
        }
    }

    protected updateMaterial(material: NodeMaterial) {
        if (material.hasColorLayer(this)) {
            // Update material parameters
            material.setLayerVisibility(this, this.visible);
            material.setLayerOpacity(this, this.opacity);
            material.setLayerElevationRange(this, this.elevationRange);
        }
    }

    protected registerNode(node: Node, extent: Extent) {
        (node.material as NodeMaterial).pushColorLayer(this, extent);
    }

    protected unregisterNode(node: Node) {
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
