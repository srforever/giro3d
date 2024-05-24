import type { ColorRepresentation, IUniform, Texture } from 'three';
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
import OffsetScale from '../core/OffsetScale';
import MaterialUtils from './MaterialUtils';

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

export type Mode = (typeof MODE)[keyof typeof MODE];

const NUM_TRANSFO = 16;

/**
 * Paremeters for a point cloud classification.
 */
export class Classification {
    /**
     * The color of this classification.
     */
    color: Color;
    /**
     * Toggles the visibility of points with this classification.
     */
    visible: boolean;

    constructor(color: ColorRepresentation, visible = true) {
        this.color = new Color(color);
        this.visible = visible;
    }

    /**
     * Clones this classification.
     * @returns The cloned object.
     */
    clone() {
        return new Classification(this.color.clone(), this.visible);
    }
}

/**
 * A set of 256 pre-defined classifications following the ASPRS scheme, with pre-defined colors for
 * classifications 0 to 18. The remaining classifications have the default color (#FF8100)
 *
 * See https://www.asprs.org/wp-content/uploads/2010/12/LAS_Specification.pdf
 */
export const ASPRS_CLASSIFICATIONS: Classification[] = new Array(256);

const DEFAULT_CLASSIFICATION = new Classification(0xff8100);

for (let i = 0; i < ASPRS_CLASSIFICATIONS.length; i++) {
    ASPRS_CLASSIFICATIONS[i] = DEFAULT_CLASSIFICATION.clone();
}

ASPRS_CLASSIFICATIONS[0] = new Classification('#858585'); // Created, never classified
ASPRS_CLASSIFICATIONS[1] = new Classification('#bfbfbf'); // Unclassified
ASPRS_CLASSIFICATIONS[2] = new Classification('#834000'); // Ground
ASPRS_CLASSIFICATIONS[3] = new Classification('#008100'); // Low vegetation
ASPRS_CLASSIFICATIONS[4] = new Classification('#00bf00'); // Medium vegetation
ASPRS_CLASSIFICATIONS[5] = new Classification('#00ff00'); // High vegetation
ASPRS_CLASSIFICATIONS[6] = new Classification('#0081c1'); // Building
ASPRS_CLASSIFICATIONS[7] = new Classification('#ff0000'); // Low point (noise)
ASPRS_CLASSIFICATIONS[8] = DEFAULT_CLASSIFICATION.clone(); // Reserved
ASPRS_CLASSIFICATIONS[9] = new Classification('#0000ff'); // Water
ASPRS_CLASSIFICATIONS[10] = new Classification('#606d73'); // Rail
ASPRS_CLASSIFICATIONS[11] = new Classification('#858585'); // Road surface
ASPRS_CLASSIFICATIONS[12] = DEFAULT_CLASSIFICATION.clone(); // Reserved
ASPRS_CLASSIFICATIONS[13] = new Classification('#ede440'); // Wire - Guard (Shield)
ASPRS_CLASSIFICATIONS[14] = new Classification('#ed6840'); // Wire - Conductor (Phase)
ASPRS_CLASSIFICATIONS[15] = new Classification('#29fff8'); // Transmission Tower
ASPRS_CLASSIFICATIONS[16] = new Classification('#5e441d'); // Wire Structure connector (e.g Insulator)
ASPRS_CLASSIFICATIONS[17] = new Classification('#7992c7'); // Bridge Deck
ASPRS_CLASSIFICATIONS[18] = new Classification('#cd27d6'); // High Noise

export interface PointCloudMaterialOptions {
    /**
     * The point size.
     *
     * @defaultValue 0
     */
    size?: number;
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

type Deformation = {
    transformation: Matrix4;
    origin: Vector2;
    influence: Vector2;
    color: Color;
    vec: Vector3;
};

interface Uniforms {
    opacity: IUniform<number>;
    brightnessContrastSaturation: IUniform<Vector3>;
    size: IUniform<number>;
    mode: IUniform<MODE>;
    pickingId: IUniform<number>;
    overlayColor: IUniform<Vector4>;
    hasOverlayTexture: IUniform<number>;
    overlayTexture: IUniform<Texture>;
    offsetScale: IUniform<OffsetScale>;
    extentBottomLeft: IUniform<Vector2>;
    extentSize: IUniform<Vector2>;

    classifications: IUniform<Classification[]>;

    enableDeformations: IUniform<boolean>;
    deformations: IUniform<Deformation[]>;

    fogDensity: IUniform<number>;
    fogNear: IUniform<number>;
    fogFar: IUniform<number>;
    fogColor: IUniform<Color>;
}

export type Defines = {
    CLASSIFICATION?: 1;
    DEFORMATION_SUPPORT?: 1;
    NUM_TRANSFO?: number;
    USE_LOGDEPTHBUF?: 1;
    USE_LOGDEPTHBUF_EXT?: 1;
    NORMAL_OCT16?: 1;
    NORMAL_SPHEREMAPPED?: 1;
};

/**
 * Material used for point clouds.
 */
class PointCloudMaterial extends ShaderMaterial {
    readonly isPointCloudMaterial = true;

    colorLayer: ColorLayer | null;
    disposed: boolean;

    /**
     * @internal
     */
    // @ts-expect-error property is not assignable.
    override readonly uniforms: Uniforms;

    /**
     * @internal
     */
    override readonly defines: Defines;

    /**
     * Gets or sets the point size.
     */
    get size() {
        return this.uniforms.size.value;
    }

    set size(value: number) {
        this.uniforms.size.value = value;
    }

    /**
     * Gets or sets the display mode (color, classification...)
     */
    get mode(): Mode {
        return this.uniforms.mode.value;
    }

    set mode(mode: Mode) {
        this.uniforms.mode.value = mode;
    }

    /**
     * @internal
     */
    get pickingId(): number {
        return this.uniforms.pickingId.value;
    }

    /**
     * @internal
     */
    set pickingId(id: number) {
        this.uniforms.pickingId.value = id;
    }

    /**
     * Gets or sets the overlay color (default color).
     */
    get overlayColor(): Vector4 {
        return this.uniforms.overlayColor.value;
    }

    set overlayColor(color: Vector4) {
        this.uniforms.overlayColor.value = color;
    }

    /**
     * Gets or sets the brightness of the points.
     */
    get brightness(): number {
        return this.uniforms.brightnessContrastSaturation.value.x;
    }

    set brightness(v) {
        this.uniforms.brightnessContrastSaturation.value.setX(v);
    }

    /**
     * Gets or sets the contrast of the points.
     */
    get contrast() {
        return this.uniforms.brightnessContrastSaturation.value.y;
    }

    set contrast(v) {
        this.uniforms.brightnessContrastSaturation.value.setY(v);
    }

    /**
     * Gets or sets the saturation of the points.
     */
    get saturation() {
        return this.uniforms.brightnessContrastSaturation.value.z;
    }

    set saturation(v) {
        this.uniforms.brightnessContrastSaturation.value.setZ(v);
    }

    /**
     * Gets or sets the classifications of the points.
     * Up to 256 values are supported (i.e classifications in the range 0-255).
     * @defaultValue {@link ASPRS_CLASSIFICATIONS} (see https://www.asprs.org/wp-content/uploads/2010/12/LAS_Specification.pdf)
     */
    get classifications(): Classification[] {
        if (!this.uniforms.classifications) {
            // Initialize with default values
            this.uniforms.classifications = new Uniform(ASPRS_CLASSIFICATIONS);
        }
        return this.uniforms.classifications.value;
    }

    set classifications(classifications: Classification[]) {
        let actual: Classification[] = classifications;

        if (classifications.length > 256) {
            actual = classifications.slice(0, 256);
            console.warn('The provided classification array has been truncated to 256 elements');
        } else if (classifications.length < 256) {
            actual = new Array(256);
            for (let i = 0; i < actual.length; i++) {
                if (i < classifications.length) {
                    actual[i] = classifications[i];
                } else {
                    actual[i] = DEFAULT_CLASSIFICATION.clone();
                }
            }
        }

        this.uniforms.classifications.value = actual;
    }

    /**
     * @internal
     */
    get enableClassification() {
        return this.defines.CLASSIFICATION !== undefined;
    }

    /**
     * @internal
     */
    set enableClassification(enable: boolean) {
        MaterialUtils.setDefine(this, 'CLASSIFICATION', enable);

        if (enable && !this.uniforms.classifications) {
            // Initialize with default values
            this.uniforms.classifications = new Uniform(ASPRS_CLASSIFICATIONS);
        }
    }

    /**
     * Creates a PointsMaterial using the specified options.
     *
     * @param options - The options.
     */
    constructor(options: PointCloudMaterialOptions = {}) {
        super({ clipping: true, glslVersion: GLSL3 });
        this.vertexShader = PointsVS;
        this.fragmentShader = PointsFS;

        for (const key of Object.keys(MODE)) {
            if (Object.prototype.hasOwnProperty.call(MODE, key)) {
                // @ts-expect-error a weird pattern indeed
                this.defines[`MODE_${key}`] = MODE[key];
            }
        }

        this.uniforms.fogDensity = new Uniform(0.00025);
        this.uniforms.fogNear = new Uniform(1);
        this.uniforms.fogFar = new Uniform(2000);
        this.uniforms.fogColor = new Uniform(new Color(0xffffff));

        this.fog = true;

        this.disposed = false;

        this.uniforms.size = new Uniform(options.size ?? 0);
        this.uniforms.mode = new Uniform(options.mode ?? MODE.COLOR);
        this.uniforms.pickingId = new Uniform(0);
        this.uniforms.opacity = new Uniform(this.opacity);
        this.uniforms.overlayColor = new Uniform(options.overlayColor ?? new Vector4(0, 0, 0, 0));
        this.uniforms.overlayTexture = new Uniform(undefined);
        this.uniforms.hasOverlayTexture = new Uniform(0);
        this.uniforms.brightnessContrastSaturation = new Uniform(new Vector3(0, 1, 1));

        if (Capabilities.isLogDepthBufferSupported()) {
            this.defines.USE_LOGDEPTHBUF = 1;
            this.defines.USE_LOGDEPTHBUF_EXT = 1;
        }
        this.extensions.fragDepth = true;

        this.uniforms.enableDeformations = new Uniform(false);
        this.uniforms.deformations = new Uniform([]);

        for (let i = 0; i < NUM_TRANSFO; i++) {
            this.uniforms.deformations.value.push({
                transformation: new Matrix4(),
                vec: new Vector3(),
                origin: new Vector2(),
                influence: new Vector2(),
                color: new Color(),
            });
        }

        this.colorLayer = null;

        this.needsUpdate = true;
    }

    dispose() {
        if (this.disposed) {
            return;
        }
        this.dispatchEvent({
            type: 'dispose',
        });
        this.disposed = true;
    }

    clone() {
        const cl = super.clone();
        cl.update(this);
        return cl;
    }

    /**
     * Internally used for picking.
     * @internal
     */
    enablePicking(picking: number) {
        this.pickingId = picking;
        this.blending = picking ? NoBlending : NormalBlending;
    }

    hasColorLayer(layer: ColorLayer) {
        return this.colorLayer === layer;
    }

    updateUniforms() {
        this.uniforms.opacity.value = this.opacity;
    }

    onBeforeRender() {
        this.updateUniforms();
    }

    update(source?: PointCloudMaterial) {
        if (source) {
            this.visible = source.visible;
            this.opacity = source.opacity;
            this.transparent = source.transparent;
            this.needsUpdate = true;
            this.size = source.size;
            this.mode = source.mode;
            this.pickingId = source.pickingId;
            this.overlayColor.copy(source.overlayColor);
            this.classifications = source.classifications;
            this.brightness = source.brightness;
            this.contrast = source.contrast;
            this.saturation = source.saturation;
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

    pushColorLayer(layer: ColorLayer, extent: Extent) {
        this.mode = MODE.TEXTURE;

        this.colorLayer = layer;
        this.uniforms.overlayTexture = new Uniform(undefined);
        this.uniforms.hasOverlayTexture = new Uniform(0);
        this.uniforms.offsetScale = new Uniform(new OffsetScale(0, 0, 1, 1));
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

    /**
     * Unused for now.
     * @internal
     */
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

    static isPointCloudMaterial = (obj: unknown): obj is PointCloudMaterial =>
        (obj as PointCloudMaterial)?.isPointCloudMaterial;
}

export default PointCloudMaterial;
