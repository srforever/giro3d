import {
    Matrix4,
    Color,
    Vector2,
    Vector3,
    Vector4,
    Uniform,
    NoBlending,
    NormalBlending,
    ShaderMaterial,
    GLSL3,
} from 'three';
import PointsVS from './shader/PointsVS.glsl';
import PointsFS from './shader/PointsFS.glsl';
import Capabilities from '../core/system/Capabilities';
import type ColorLayer from '../core/layer/ColorLayer';
import type Extent from '../core/geographic/Extent';
import type { TextureAndPitch } from '../core/layer/Layer';

/**
 * Specifies the way points are colored.
 */
export enum MODE {
    /** The points are colored using their own color */
    COLOR = 0,
    /** The points are colored using their intensity */
    INTENSITY = 1,
    /** The points are colored using their classification */
    CLASSIFICATION = 2,
    /** The points are colored using their normal */
    NORMAL = 3,
    /** The points are colored using an external texture, such as a color layer */
    TEXTURE = 4,
    /** The points are colored using their elevation */
    ELEVATION = 5,
}

export type Mode = typeof MODE[keyof typeof MODE];

const NUM_TRANSFO = 16;

export interface PointsMaterialOptions {
    /**
     * The point size.
     *
     * @defaultValue 0
     */
    size?: number;
    /** The point scale. */
    scale?: number;
    /**
     * An additional color to use.
     *
     * @defaultValue `new Vector4(0, 0, 0, 0)`
     */
    overlayColor?: Vector4;
    /**
     * Specifies the criterion to colorize points.
     *
     * @defaultValue MODE.COLOR
     */
    mode?: Mode;
}

class PointsMaterial extends ShaderMaterial {
    size: number;
    scale: number;
    overlayColor: Vector4;
    private _brightness: number;
    private _contrast: number;
    private _saturation: number;
    mode: Mode;
    pickingId: number;
    transformations: Matrix4[];
    vec: Vector3[];
    origin: Vector2[];
    influence: Vector2[];
    tColors: Color[];
    colorLayer: ColorLayer | null;
    disposed?: boolean;
    private _mustUpdateUniforms?: boolean;

    /**
     * Creates a PointsMaterial using the specified options.
     *
     * @param options - The options.
     */
    constructor(options: PointsMaterialOptions = {}) {
        super({ clipping: true, glslVersion: GLSL3 });
        // @ts-ignore
        if (__DEBUG__) {
            this.defines.DEBUG = 1;
        }
        this.vertexShader = PointsVS;
        this.fragmentShader = PointsFS;

        this.size = options.size ?? 0;
        this.scale = options.scale ?? (0.05 * 0.5) / Math.tan(1.0 / 2.0); // autosizing scale
        this.overlayColor = options.overlayColor ?? new Vector4(0, 0, 0, 0);
        this._brightness = 0;
        this._contrast = 1;
        this._saturation = 1;
        this.mode = options.mode ?? MODE.COLOR;
        this.pickingId = 0;

        for (const key of Object.keys(MODE)) {
            if (Object.prototype.hasOwnProperty.call(MODE, key)) {
                // @ts-ignore
                this.defines[`MODE_${key}`] = MODE[key];
            }
        }

        this.uniforms.size = new Uniform(this.size);
        this.uniforms.mode = new Uniform(this.mode);
        this.uniforms.pickingId = new Uniform(this.pickingId);
        this.uniforms.opacity = new Uniform(this.opacity);
        this.uniforms.overlayColor = new Uniform(this.overlayColor);
        this.uniforms.overlayTexture = new Uniform(undefined);
        this.uniforms.hasOverlayTexture = new Uniform(0);
        this.uniforms.brightnessContrastSaturation = new Uniform(
            new Vector3(this._brightness, this._contrast, this._saturation),
        );

        if (Capabilities.isLogDepthBufferSupported()) {
            this.defines.USE_LOGDEPTHBUF = 1;
            this.defines.USE_LOGDEPTHBUF_EXT = 1;
        }
        this.extensions.fragDepth = true;
        this.uniforms.enableTransfo = new Uniform(0);

        this.transformations = [];
        for (let i = 0; i < NUM_TRANSFO; i++) {
            this.transformations.push(new Matrix4());
        }
        this.uniforms.transformations = new Uniform(this.transformations);

        this.vec = [];
        for (let i = 0; i < NUM_TRANSFO; i++) {
            this.vec.push(new Vector3());
        }
        this.uniforms.vec = new Uniform(this.vec);

        this.origin = [];
        for (let i = 0; i < NUM_TRANSFO; i++) {
            this.origin.push(new Vector2());
        }
        this.uniforms.origin = new Uniform(this.origin);

        this.influence = [];
        for (let i = 0; i < NUM_TRANSFO; i++) {
            this.influence.push(new Vector2());
        }
        this.uniforms.influence = new Uniform(this.influence);

        this.tColors = [];
        for (let i = 0; i < NUM_TRANSFO; i++) {
            this.tColors.push(new Color());
        }
        this.colorLayer = null;
        this.uniforms.tColors = new Uniform(this.tColors);

        this.updateUniforms();
    }

    dispose() {
        if (this.disposed) {
            return;
        }
        this.dispatchEvent({
            type: 'dispose',
        });
        this.disposed = true;

        const texture = this.getColorTexture(this.colorLayer);
        if (texture?.owner === this) {
            texture.dispose();
        }
    }

    clone() {
        const cl = super.clone();
        cl.update(this);
        return cl;
    }

    enablePicking(picking: number) {
        this.pickingId = picking;
        this.blending = picking ? NoBlending : NormalBlending;
        this.updateUniforms();
    }

    hasColorLayer(layer: ColorLayer) {
        return this.colorLayer === layer;
    }

    updateUniforms() {
        // if size is null, switch to autosizing using the canvas height
        this.uniforms.size.value = (this.size > 0) ? this.size : -this.scale * window.innerHeight;
        this.uniforms.mode.value = this.mode;
        this.uniforms.pickingId.value = this.pickingId;
        this.uniforms.opacity.value = this.opacity;
        this.uniforms.overlayColor.value = this.overlayColor;
        this.uniforms.brightnessContrastSaturation.value = new Vector3(
            this._brightness,
            this._contrast,
            this._saturation,
        );
    }

    update(source?: PointsMaterial) {
        if (source) {
            this.visible = source.visible;
            this.opacity = source.opacity;
            this.transparent = source.transparent;
            this.needsUpdate = true;
            this.size = source.size;
            this.mode = source.mode;
            this.pickingId = source.pickingId;
            this.scale = source.scale;
            this.overlayColor.copy(source.overlayColor);
            this._brightness = source._brightness;
            this._contrast = source._contrast;
            this._saturation = source._saturation;
        }
        this.updateUniforms();
        if (source) {
            Object.assign(this.defines, source.defines);
        }
        return this;
    }

    removeColorLayer() {
        this.mode = MODE.COLOR;
        this.colorLayer = null;
        this.uniforms.overlayTexture.value = null;
        this.needsUpdate = true;
        this.uniforms.hasOverlayTexture.value = 0;
    }

    // Coloring support
    pushColorLayer(layer: ColorLayer, extent: Extent) {
        this.mode = MODE.TEXTURE;
        this.updateUniforms();

        this.colorLayer = layer;
        this.uniforms.overlayTexture = new Uniform(undefined);
        this.uniforms.hasOverlayTexture = new Uniform(0);
        this.uniforms.offsetScale = new Uniform(new Vector4(0, 0, 1, 1));
        this.uniforms.extentBottomLeft = new Uniform(new Vector2(extent.west(), extent.south()));
        const dim = extent.dimensions();
        this.uniforms.extentSize = new Uniform(new Vector2(dim.x, dim.y));
        this.needsUpdate = true;
    }

    indexOfColorLayer(layer: ColorLayer) {
        if (layer === this.colorLayer) {
            return 0;
        }

        return -1;
    }

    getColorTexture(layer: ColorLayer) {
        if (layer !== this.colorLayer) {
            return null;
        }
        return this.uniforms.overlayTexture?.value;
    }

    setColorTextures(layer: ColorLayer, textureAndPitch: TextureAndPitch) {
        const { texture, pitch } = textureAndPitch;
        this.uniforms.overlayTexture.value = texture;
        this.uniforms.hasOverlayTexture.value = 1;
        this.uniforms.offsetScale.value.copy(pitch);
    }

    // eslint-disable-next-line class-methods-use-this
    setLayerVisibility() {
        // no-op
    }

    // eslint-disable-next-line class-methods-use-this
    setLayerOpacity() {
        // no-op
    }

    // eslint-disable-next-line class-methods-use-this
    setLayerElevationRange() {
        // no-op
    }

    /**
     * Gets or sets the brightness of this layer.
     */
    get brightness() {
        return this._brightness;
    }

    set brightness(v) {
        if (this._brightness !== v) {
            this._brightness = v;
            this._mustUpdateUniforms = true;
        }
    }

    /**
     * Gets or sets the contrast of this layer.
     */
    get contrast() {
        return this._contrast;
    }

    set contrast(v) {
        if (this._contrast !== v) {
            this._contrast = v;
            this._mustUpdateUniforms = true;
        }
    }

    /**
     * Gets or sets the saturation of this layer.
     */
    get saturation() {
        return this._saturation;
    }

    set saturation(v) {
        if (this._saturation !== v) {
            this._saturation = v;
            this._mustUpdateUniforms = true;
        }
    }

    // eslint-disable-next-line class-methods-use-this
    setColorimetry(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        layer: ColorLayer,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        brightness: number,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        contrast: number,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        saturation: number,
    ) {
        // Not implemented because the points have their own BCS controls
    }

    enableTransfo(v: boolean) {
        if (v) {
            this.defines.DEFORMATION_SUPPORT = 1;
            this.defines.NUM_TRANSFO = NUM_TRANSFO;
        } else {
            delete this.defines.DEFORMATION_SUPPORT;
            delete this.defines.NUM_TRANSFO;
        }
        this.needsUpdate = true;
    }

    static isPointsMaterial = (obj: any): obj is PointsMaterial => obj?.enablePicking;
}

export default PointsMaterial;
