import {
    Color,
    ShaderMaterial,
    Texture,
    Uniform,
    Vector2,
    Vector4,
    DoubleSide,
    FrontSide,
    NormalBlending,
    NoBlending,
    Vector3,
    GLSL3,
    RGBAFormat,
    UnsignedByteType,
} from 'three';
import type {
    IUniform,
    WebGLRenderer,
    TextureDataType,
} from 'three';
import RenderingState from './RenderingState';
import TileVS from './shader/TileVS.glsl';
import TileFS from './shader/TileFS.glsl';
import WebGLComposer from './composition/WebGLComposer';
import Rect from '../core/Rect';
import MemoryTracker from './MemoryTracker';
import MaterialUtils from './MaterialUtils';
import type { TextureAndPitch } from '../core/layer/Layer';
import type Layer from '../core/layer/Layer';
import type MaskLayer from '../core/layer/MaskLayer';
import type ContourLineOptions from '../core/ContourLineOptions';
import type TerrainOptions from '../core/TerrainOptions';
import type HillshadingOptions from '../core/HillshadingOptions';
import type GraticuleOptions from '../core/GraticuleOptions';
import type ColorimetryOptions from '../core/ColorimetryOptions';
import type ElevationLayer from '../core/layer/ElevationLayer';
import type ColorLayer from '../core/layer/ColorLayer';
import type ElevationRange from '../core/ElevationRange';
import type Extent from '../core/geographic/Extent';
import type ColorMapAtlas from './ColorMapAtlas';
import type { AtlasInfo, LayerAtlasInfo } from './AtlasBuilder';
import TextureGenerator from '../utils/TextureGenerator';
import type { MaskMode } from '../core/layer/MaskLayer';
import type { ColorMapMode } from '../core/layer';

const EMPTY_IMAGE_SIZE = 16;

interface ElevationTexture extends Texture {
    /**
     * Flag to determine if the texture is borrowed from
     * an ancestor of it is the final texture of this material.
     */
    isFinal: boolean;
}

const emptyTexture = new Texture();

function makeArray(size: number) {
    const array = new Array(size);
    for (let i = 0; i < size; i++) {
        array[i] = {};
    }
    return array;
}

const COLORMAP_DISABLED = 0;

const DISABLED_ELEVATION_RANGE = new Vector2(-999999, 999999);

class TextureInfo {
    originalOffsetScale: Vector4;
    offsetScale: Vector4;
    readonly layer: Layer;
    texture: Texture;
    opacity: number;
    visible: boolean;
    color: Color;
    elevationRange: Vector2;
    brightnessContrastSaturation: Vector3;

    constructor(layer: Layer) {
        this.layer = layer;
        this.offsetScale = null;
        this.originalOffsetScale = null;
        this.texture = null;
        this.opacity = null;
        this.visible = null;
        this.brightnessContrastSaturation = new Vector3(0, 1, 1);
        this.color = null;
    }

    get mode() {
        return (this.layer as MaskLayer).maskMode || 0;
    }
}

export const DEFAULT_HILLSHADING_INTENSITY = 1;
export const DEFAULT_HILLSHADING_ZFACTOR = 1;
export const DEFAULT_AZIMUTH = 135;
export const DEFAULT_ZENITH = 45;
export const DEFAULT_GRATICULE_COLOR = new Color(0, 0, 0);
export const DEFAULT_GRATICULE_STEP = 500; // meters
export const DEFAULT_GRATICULE_THICKNESS = 1;

function drawImageOnAtlas(
    width: number,
    height: number,
    composer: WebGLComposer,
    atlasInfo: LayerAtlasInfo,
    texture: Texture,
) {
    const dx = atlasInfo.x;
    const dy = atlasInfo.y + atlasInfo.offset;
    const dw = width;
    const dh = height;

    const rect = new Rect(dx, dx + dw, dy, dy + dh);

    composer.draw(texture, rect);
}

function updateOffsetScale(
    imageSize: Vector2,
    atlas: LayerAtlasInfo,
    originalOffsetScale: Vector4,
    width: number,
    height: number,
    target: Vector4,
) {
    if (originalOffsetScale.z === 0 || originalOffsetScale.w === 0) {
        target.set(0, 0, 0, 0);
        return;
    }
    // compute offset / scale
    const xRatio = imageSize.width / width;
    const yRatio = imageSize.height / height;

    target.set(
        atlas.x / width + originalOffsetScale.x * xRatio,
        (atlas.y + atlas.offset) / height + originalOffsetScale.y * yRatio,
        originalOffsetScale.z * xRatio,
        originalOffsetScale.w * yRatio,
    );
}

export interface MaterialOptions {
    /**
     * Discards no-data pixels.
     */
    discardNoData?: boolean;
    /**
     * Geometric terrain options.
     */
    terrain?: TerrainOptions;
    /**
     * Colorimetry options for the entire material.
     */
    colorimetry?: ColorimetryOptions;
    /**
     * Toggles double-sided surfaces.
     */
    doubleSided?: boolean;
    /**
     * Contour lines options.
     */
    contourLines?: ContourLineOptions;
    /**
     * Hillshading options.
     */
    hillshading?: HillshadingOptions;
    /**
     * Graticule options.
     */
    graticule?: GraticuleOptions;
    /**
     * The number of subdivision segments per tile.
     */
    segments?: number;
    /**
     * The elevation range.
     */
    elevationRange?: { min: number; max: number; };
    /**
     * The colormap atlas.
     */
    colorMapAtlas?: ColorMapAtlas;
    /**
     * The background color.
     */
    backgroundColor?: Color;
    /**
     * The background opacity.
     */
    backgroundOpacity?: number;
    /**
     * Show the outlines of tile meshes.
     */
    showTileOutlines?: boolean;
}

type HillshadingUniform = {
    intensity: number;
    zFactor: number;
    zenith: number;
    azimuth: number;
};

type ContourLineUniform = {
    thickness: number;
    primaryInterval: number;
    secondaryInterval: number;
    color: Vector4;
};

type GraticuleUniform = {
    thickness: number;
    /** xOffset, yOffset, xStep, yStep */
    position: Vector4;
    color: Vector4;
};

type LayerUniform = {
    offsetScale: Vector4;
    color: Vector4;
    textureSize: Vector2;
    elevationRange: Vector2;
    mode: 0 | MaskMode;
    brightnessContrastSaturation: Vector3;
};

type NeighbourUniform = {
    offsetScale: Vector4;
    diffLevel: number;
    elevationTexture: Texture;
};

type ColorMapUniform = {
    mode: ColorMapMode | 0;
    min: number;
    max: number;
    offset: number;
};

type Defines = {
    ENABLE_CONTOUR_LINES?: 1;
    STITCHING?: 1;
    TERRAIN_DEFORMATION?: 1;
    DISCARD_NODATA_ELEVATION?: 1;
    ENABLE_ELEVATION_RANGE?: 1;
    ELEVATION_LAYER?: 1;
    ENABLE_LAYER_MASKS?: 1;
    ENABLE_OUTLINES?: 1;
    ENABLE_HILLSHADING?: 1;
    APPLY_SHADING_ON_COLORLAYERS?: 1;
    ENABLE_GRATICULE?: 1;
    COLOR_LAYERS: number;
};

interface Uniforms {
    opacity: IUniform<number>;
    segments: IUniform<number>;
    contourLines: IUniform<ContourLineUniform>;
    graticule: IUniform<GraticuleUniform>;
    hillshading: IUniform<HillshadingUniform>;
    elevationRange: IUniform<Vector2>;
    tileDimensions: IUniform<Vector2>;
    elevationTexture: IUniform<Texture>;
    colorTexture: IUniform<Texture>;
    uuid: IUniform<number>;
    backgroundColor: IUniform<Vector4>;
    layers: IUniform<LayerUniform[]>;
    elevationLayer: IUniform<LayerUniform>;
    brightnessContrastSaturation: IUniform<Vector3>;
    renderingState: IUniform<RenderingState>;
    neighbours: IUniform<NeighbourUniform[]>;
    colorMapAtlas: IUniform<Texture>;
    layersColorMaps: IUniform<ColorMapUniform[]>;
    elevationColorMap: IUniform<ColorMapUniform>;

    fogDensity: IUniform<number>;
    fogNear: IUniform<number>;
    fogFar: IUniform<number>;
    fogColor: IUniform<Color>;
}

class LayeredMaterial extends ShaderMaterial {
    private readonly _getIndexFn: (arg0: Layer) => number;
    private readonly _renderer: WebGLRenderer;
    private readonly _colorLayers: ColorLayer[] = [];

    readonly texturesInfo: {
        color: {
            infos: TextureInfo[];
            atlasTexture: Texture;
            parentAtlasTexture: Texture;
        };
        elevation: {
            offsetScale: Vector4;
            texture: ElevationTexture;
        };
    };
    private _elevationLayer: ElevationLayer;
    private _mustUpdateUniforms: boolean;
    private _needsSorting: boolean;
    private _needsAtlasRepaint: boolean;
    private _composer: WebGLComposer;
    private _colorMapAtlas: ColorMapAtlas;
    private _composerDataType: TextureDataType = UnsignedByteType;

    // @ts-expect-error property is not assignable.
    override readonly uniforms: Uniforms;

    override readonly defines: Defines;

    private readonly _atlasInfo: AtlasInfo;
    private _options: MaterialOptions;
    private _hasElevationLayer: boolean;

    constructor({
        options = {},
        renderer,
        atlasInfo,
        getIndexFn,
        textureDataType,
        hasElevationLayer,
    }: {
        /** the material options. */
        options: MaterialOptions;
        /** the WebGL renderer. */
        renderer: WebGLRenderer;
        /**  the Atlas info */
        atlasInfo: AtlasInfo;
        /** The function to help sorting color layers. */
        getIndexFn: (arg0: Layer) => number;
        /** The texture data type to be used for the atlas texture. */
        textureDataType: TextureDataType;
        hasElevationLayer: boolean;
    }) {
        super({ clipping: true, glslVersion: GLSL3 });

        this._atlasInfo = atlasInfo;
        MaterialUtils.setDefine(this, 'STITCHING', options.terrain?.stitching);
        MaterialUtils.setDefine(this, 'TERRAIN_DEFORMATION', options.terrain?.enabled);
        this._renderer = renderer;

        this._hasElevationLayer = hasElevationLayer;
        this._composerDataType = textureDataType;
        this.uniforms.hillshading = new Uniform<HillshadingUniform>({
            zenith: DEFAULT_ZENITH,
            azimuth: DEFAULT_AZIMUTH,
            intensity: DEFAULT_HILLSHADING_INTENSITY,
            zFactor: DEFAULT_HILLSHADING_ZFACTOR,
        });

        this.uniforms.fogDensity = new Uniform(0.00025);
        this.uniforms.fogNear = new Uniform(1);
        this.uniforms.fogFar = new Uniform(2000);
        this.uniforms.fogColor = new Uniform(new Color(0xffffff));

        this.fog = true;

        this._getIndexFn = getIndexFn;

        MaterialUtils.setDefine(this, 'DISCARD_NODATA_ELEVATION', options.discardNoData);

        this.uniforms.segments = new Uniform(options.segments);

        this.uniforms.contourLines = new Uniform({
            thickness: 1,
            primaryInterval: 100,
            secondaryInterval: 20,
            color: new Vector4(0, 0, 0, 1),
        });

        this.uniforms.graticule = new Uniform<GraticuleUniform>({
            color: new Vector4(0, 0, 0, 1),
            thickness: DEFAULT_GRATICULE_THICKNESS,
            position: new Vector4(0, 0, DEFAULT_GRATICULE_STEP, DEFAULT_GRATICULE_STEP),
        });

        const elevationRange = options.elevationRange
            ? new Vector2(options.elevationRange.min, options.elevationRange.max)
            : DISABLED_ELEVATION_RANGE;
        this.uniforms.elevationRange = new Uniform(elevationRange);

        this.uniforms.brightnessContrastSaturation = new Uniform(new Vector3(0, 1, 1));

        MaterialUtils.setDefine(this, 'ENABLE_ELEVATION_RANGE', options.elevationRange != null);

        this.side = options.doubleSided ? DoubleSide : FrontSide;

        this.uniforms.renderingState = new Uniform(RenderingState.FINAL);

        this.defines.COLOR_LAYERS = 0;

        this.fragmentShader = TileFS;
        this.vertexShader = TileVS;

        this._composer = this.createComposer();

        this.texturesInfo = {
            color: {
                infos: [],
                atlasTexture: null,
                parentAtlasTexture: null,
            },
            elevation: {
                offsetScale: new Vector4(0, 0, 0, 0),
                texture: emptyTexture as ElevationTexture,
            },
        };

        this.uniforms.tileDimensions = new Uniform(new Vector2());
        this.uniforms.brightnessContrastSaturation = new Uniform(new Vector3(0, 1, 1));
        this.uniforms.neighbours = new Uniform(new Array(8));
        for (let i = 0; i < 8; i++) {
            this.uniforms.neighbours.value[i] = {
                diffLevel: 0,
                offsetScale: null,
                elevationTexture: null,
            };
        }

        // Elevation texture
        const elevInfo = this.texturesInfo.elevation;
        this.uniforms.elevationTexture = new Uniform(elevInfo.texture);
        this.uniforms.elevationLayer = new Uniform({
            brightnessContrastSaturation: null,
            color: null,
            elevationRange: null,
            mode: null,
            offsetScale: null,
            textureSize: null,
        });

        // Color textures's layer
        this.uniforms.colorTexture = new Uniform(this.texturesInfo.color.atlasTexture);

        // Describe the properties of each color layer (offsetScale, color...).
        this.uniforms.layers = new Uniform([]);
        this.uniforms.layersColorMaps = new Uniform([]);
        this.uniforms.colorMapAtlas = new Uniform(null);

        this.uniforms.elevationColorMap = new Uniform({
            mode: 0,
            offset: null,
            max: null,
            min: null,
        });

        this._colorMapAtlas = options.colorMapAtlas;

        this.uniformsNeedUpdate = true;

        this.uniforms.uuid = new Uniform(0);

        this.uniforms.backgroundColor = new Uniform(new Vector4());
        this.uniforms.opacity = new Uniform(1.0);

        this._needsAtlasRepaint = false;

        this.update(options);

        MemoryTracker.track(this, 'LayeredMaterial');
    }

    get pixelWidth() {
        return this._composer.width;
    }

    get pixelHeight() {
        return this._composer.height;
    }

    /**
     * @param v - The number of segments.
     */
    set segments(v: number) {
        if (this.uniforms.segments.value !== v) {
            this.uniforms.segments.value = v;
        }
    }

    private _updateColorLayerUniforms() {
        this.sortLayersIfNecessary();

        if (this._mustUpdateUniforms) {
            const layersUniform = [];
            const infos = this.texturesInfo.color.infos;

            for (const info of infos) {
                const offsetScale = info.offsetScale;
                const tex = info.texture;
                let textureSize = new Vector2(0, 0);
                const image = tex.image;
                if (image) {
                    textureSize = new Vector2(image.width, image.height);
                }

                const rgb = info.color;
                const a = info.visible ? info.opacity : 0;
                const color = new Vector4(rgb.r, rgb.g, rgb.b, a);
                const elevationRange = info.elevationRange || DISABLED_ELEVATION_RANGE;

                const uniform = {
                    offsetScale,
                    color,
                    textureSize,
                    elevationRange,
                    mode: info.mode,
                    brightnessContrastSaturation: info.brightnessContrastSaturation,
                };

                layersUniform.push(uniform);
            }

            this.uniforms.layers.value = layersUniform;
        }
    }

    dispose() {
        this.dispatchEvent({
            type: 'dispose',
        });

        for (const layer of this._colorLayers) {
            const index = this.indexOfColorLayer(layer);
            if (index === -1) {
                continue;
            }
            delete this.texturesInfo.color.infos[index];
        }

        this._colorLayers.length = 0;
        this._composer.dispose();
        this.texturesInfo.color.atlasTexture?.dispose();
    }

    getColorTexture(layer: ColorLayer) {
        const index = this.indexOfColorLayer(layer);

        if (index === -1) {
            return null;
        }
        return this.texturesInfo.color.infos[index].texture;
    }

    onBeforeRender() {
        this._updateOpacityParameters(this.opacity);
        this._updateColorLayerUniforms();

        if (this._needsAtlasRepaint) {
            this.repaintAtlas();
            this._needsAtlasRepaint = false;
        }
    }

    repaintAtlas() {
        this.rebuildAtlasIfNecessary();

        this._composer.reset();

        // Redraw all color layers on the canvas
        for (const l of this._colorLayers) {
            const idx = this.indexOfColorLayer(l);
            const atlas = this._atlasInfo.atlas[l.id];

            const layerTexture = this.texturesInfo.color.infos[idx].texture;

            const w = layerTexture?.image?.width || EMPTY_IMAGE_SIZE;
            const h = layerTexture?.image?.height || EMPTY_IMAGE_SIZE;

            updateOffsetScale(
                new Vector2(w, h),
                this._atlasInfo.atlas[l.id],
                this.texturesInfo.color.infos[idx].originalOffsetScale,
                this._composer.width,
                this._composer.height,
                this.texturesInfo.color.infos[idx].offsetScale,
            );

            if (layerTexture) {
                drawImageOnAtlas(w, h, this._composer, atlas, layerTexture);
            }
        }

        const rendered = this._composer.render();
        rendered.name = 'LayeredMaterial - Atlas';

        // Even though we asked the composer to reuse the same texture, sometimes it has
        // to recreate a new texture when some parameters change, such as pixel format.
        if (rendered.uuid !== this.texturesInfo.color.atlasTexture?.uuid) {
            this.rebuildAtlasTexture(rendered);
        }

        this.uniforms.colorTexture.value = this.texturesInfo.color.atlasTexture;
    }

    setColorTextures(layer: ColorLayer, textureAndPitch: TextureAndPitch) {
        const index = this.indexOfColorLayer(layer);
        const { pitch, texture } = textureAndPitch;
        this.texturesInfo.color.infos[index].originalOffsetScale.copy(pitch);
        this.texturesInfo.color.infos[index].texture = texture;

        const currentSize = TextureGenerator.getBytesPerChannel(this._composerDataType);
        const textureSize = TextureGenerator.getBytesPerChannel(texture.type);
        if (textureSize > currentSize) {
            // The new layer uses a bigger data type, we need to recreate the atlas
            this._composerDataType = texture.type;
        }

        this._needsAtlasRepaint = true;
    }

    /**
     * Gets the elevation texture if an elevation layer texture has been loaded in this material.
     *
     * @returns Returns the elevation texture or null
     */
    getElevationTextureInfo() {
        if (this.isElevationLayerTextureLoaded()) {
            return {
                texture: this.texturesInfo.elevation.texture,
                offsetScale: this.texturesInfo.elevation.offsetScale,
            };
        }
        return null;
    }

    pushElevationLayer(layer: ElevationLayer) {
        this._elevationLayer = layer;
        this._hasElevationLayer = true;
    }

    removeElevationLayer() {
        this._elevationLayer = null;
        this.uniforms.elevationTexture.value = null;
        this.texturesInfo.elevation.texture = null;
        this._hasElevationLayer = false;
        MaterialUtils.setDefine(this, 'ELEVATION_LAYER', false);
    }

    setElevationTexture(
        layer: ElevationLayer,
        { texture, pitch }: { texture: Texture, pitch: Vector4 },
        isFinal: boolean,
    ) {
        this._elevationLayer = layer;

        MaterialUtils.setDefine(this, 'ELEVATION_LAYER', true);

        this.uniforms.elevationTexture.value = texture;
        this.texturesInfo.elevation.texture = texture as ElevationTexture;
        (texture as ElevationTexture).isFinal = isFinal;
        this.texturesInfo.elevation.offsetScale.copy(pitch);

        const uniform = this.uniforms.elevationLayer.value;
        uniform.offsetScale = pitch;
        uniform.textureSize = new Vector2(texture.image.width, texture.image.height);
        uniform.color = new Vector4(1, 1, 1, 1);
        uniform.brightnessContrastSaturation = new Vector3(1, 1, 1);
        uniform.elevationRange = new Vector2();

        this._updateColorMaps();

        return Promise.resolve(true);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    pushColorLayer(newLayer: ColorLayer, _extent: Extent) {
        if (this._colorLayers.includes(newLayer)) {
            return;
        }
        this._colorLayers.push(newLayer);

        const info = new TextureInfo(newLayer);

        if (newLayer.type === 'MaskLayer') {
            MaterialUtils.setDefine(this, 'ENABLE_LAYER_MASKS', true);
        }
        info.opacity = newLayer.opacity;
        info.visible = newLayer.visible;
        info.offsetScale = new Vector4(0, 0, 0, 0);
        info.originalOffsetScale = new Vector4(0, 0, 0, 0);
        info.texture = emptyTexture;
        info.color = new Color(1, 1, 1);

        // Optional feature: limit color layer display within an elevation range
        const hasElevationRange = newLayer.elevationRange != null;
        if (hasElevationRange) {
            MaterialUtils.setDefine(this, 'ENABLE_ELEVATION_RANGE', true);
            const { min, max } = newLayer.elevationRange;
            info.elevationRange = new Vector2(min, max);
        }

        this.texturesInfo.color.infos.push(info);

        this._needsSorting = true;
        this._mustUpdateUniforms = true;

        this._updateColorMaps();

        this.defines.COLOR_LAYERS = this._colorLayers.length;
        this.needsUpdate = true;
    }

    reorderLayers() {
        this._needsSorting = true;
    }

    private sortLayersIfNecessary() {
        const idx = this._getIndexFn;
        if (this._needsSorting) {
            this._colorLayers.sort((a, b) => idx(a) - idx(b));
            this.texturesInfo.color.infos.sort((a, b) => idx(a.layer) - idx(b.layer));
            this._needsSorting = false;
        }
    }

    removeColorLayer(layer: ColorLayer) {
        const index = this.indexOfColorLayer(layer);
        if (index === -1) {
            return;
        }
        // NOTE: we cannot dispose the texture here, because it might be cached for later.
        this.texturesInfo.color.infos.splice(index, 1);
        this._colorLayers.splice(index, 1);

        this._needsSorting = true;
        this._mustUpdateUniforms = true;
        this._updateColorMaps();

        this.defines.COLOR_LAYERS = this._colorLayers.length;

        this.needsUpdate = true;
        this._needsAtlasRepaint = true;
    }

    /**
     * Sets the colormap atlas.
     *
     * @param atlas - The atlas.
     */
    setColorMapAtlas(atlas: ColorMapAtlas) {
        this._colorMapAtlas = atlas;
    }

    _updateColorMaps() {
        this.sortLayersIfNecessary();

        const atlas = this._colorMapAtlas;

        const elevationColorMap = this._elevationLayer?.colorMap;

        const elevationUniform = this.uniforms.elevationColorMap;
        if (elevationColorMap?.active) {
            elevationUniform.value.mode = elevationColorMap?.mode ?? COLORMAP_DISABLED;
            elevationUniform.value.min = elevationColorMap?.min ?? 0;
            elevationUniform.value.max = elevationColorMap?.max ?? 0;
            elevationUniform.value.offset = atlas?.getOffset(elevationColorMap) || 0;
        } else {
            elevationUniform.value.mode = COLORMAP_DISABLED;
            elevationUniform.value.min = 0;
            elevationUniform.value.max = 0;
        }

        const colorLayers = this.texturesInfo.color.infos;
        const colorMaps = makeArray(colorLayers.length);

        for (let i = 0; i < colorLayers.length; i++) {
            const texInfo = colorLayers[i];
            const colorUniform = colorMaps[i];
            const colorMap = texInfo.layer.colorMap;
            if (colorMap?.active) {
                colorUniform.mode = colorMap.mode;
                colorUniform.min = colorMap.min ?? 0;
                colorUniform.max = colorMap.max ?? 0;
                colorUniform.offset = atlas?.getOffset(colorMap) || 0;
            } else {
                colorUniform.mode = COLORMAP_DISABLED;
            }
        }

        this.uniforms.layersColorMaps = new Uniform(colorMaps);
        if (atlas?.texture) {
            const luts = atlas.texture || null;
            if (!this.uniforms.colorMapAtlas) {
                this.uniforms.colorMapAtlas = new Uniform(luts);
            }
            this.uniforms.colorMapAtlas.value = luts;
        }
    }

    /**
     * @param materialOptions - The material options.
     */
    update(materialOptions: MaterialOptions = {}) {
        this._options = materialOptions;

        if (this._colorMapAtlas) {
            this._updateColorMaps();
        }

        if (materialOptions.backgroundColor) {
            const a = materialOptions.backgroundOpacity;
            const c = materialOptions.backgroundColor;
            const vec4 = new Vector4(c.r, c.g, c.b, a);
            this.uniforms.backgroundColor.value.copy(vec4);
        }

        if (materialOptions.graticule) {
            const options = materialOptions.graticule;
            const enabled = options.enabled;
            MaterialUtils.setDefine(this, 'ENABLE_GRATICULE', enabled);
            if (enabled) {
                const uniform = this.uniforms.graticule.value;
                uniform.thickness = options.thickness;
                uniform.position.set(options.xOffset, options.yOffset, options.xStep, options.yStep);
                const rgb = options.color;
                uniform.color.set(rgb.r, rgb.g, rgb.b, options.opacity);
            }
        }

        if (materialOptions.colorimetry) {
            const opts = materialOptions.colorimetry;
            this.uniforms.brightnessContrastSaturation.value
                .set(opts.brightness, opts.contrast, opts.saturation);
        }

        if (materialOptions.contourLines) {
            const opts = materialOptions.contourLines;

            if (opts.enabled) {
                const c = opts.color;
                const a = opts.opacity;

                this.uniforms.contourLines.value = {
                    thickness: opts.thickness ?? 1,
                    primaryInterval: opts.interval ?? 100,
                    secondaryInterval: opts.secondaryInterval ?? 0,
                    color: new Vector4(c.r, c.g, c.b, a),
                };
            }

            MaterialUtils.setDefine(this, 'ENABLE_CONTOUR_LINES', opts.enabled);
        }

        if (materialOptions.elevationRange) {
            const { min, max } = materialOptions.elevationRange;
            this.uniforms.elevationRange.value.set(min, max);
        }

        MaterialUtils.setDefine(this, 'ELEVATION_LAYER', this._elevationLayer?.visible);
        MaterialUtils.setDefine(this, 'ENABLE_OUTLINES', materialOptions.showTileOutlines);
        MaterialUtils.setDefine(this, 'DISCARD_NODATA_ELEVATION', materialOptions.discardNoData);

        if (materialOptions.terrain) {
            MaterialUtils.setDefine(this, 'TERRAIN_DEFORMATION', materialOptions.terrain.enabled);
            MaterialUtils.setDefine(this, 'STITCHING', materialOptions.terrain.stitching);
        }

        const hillshadingParams = materialOptions.hillshading;
        if (hillshadingParams) {
            const uniform = this.uniforms.hillshading.value;
            uniform.zenith = hillshadingParams.zenith ?? DEFAULT_ZENITH;
            uniform.azimuth = hillshadingParams.azimuth ?? DEFAULT_AZIMUTH;
            uniform.intensity = hillshadingParams.intensity ?? 1;
            uniform.zFactor = hillshadingParams.zFactor ?? 1;
            MaterialUtils.setDefine(this, 'ENABLE_HILLSHADING', hillshadingParams.enabled);
            MaterialUtils.setDefine(this, 'APPLY_SHADING_ON_COLORLAYERS', !hillshadingParams.elevationLayersOnly);
        } else {
            MaterialUtils.setDefine(this, 'ENABLE_HILLSHADING', false);
        }

        const newSide = materialOptions.doubleSided ? DoubleSide : FrontSide;
        if (this.side !== newSide) {
            this.side = newSide;
            this.needsUpdate = true;
        }

        if (this._colorLayers.length === 0) {
            return true;
        }
        return this.rebuildAtlasIfNecessary();
    }

    createComposer() {
        const newComposer = new WebGLComposer({
            extent: new Rect(0, this._atlasInfo.maxX, 0, this._atlasInfo.maxY),
            width: this._atlasInfo.maxX,
            height: this._atlasInfo.maxY,
            reuseTexture: true,
            webGLRenderer: this._renderer,
            pixelFormat: RGBAFormat,
            textureDataType: this._composerDataType,
        });
        return newComposer;
    }

    rebuildAtlasIfNecessary() {
        if (this._atlasInfo.maxX > this._composer.width
            || this._atlasInfo.maxY > this._composer.height
            || this._composer.dataType !== this._composerDataType) {
            const newComposer = this.createComposer();

            let newTexture;

            const currentTexture = this.texturesInfo.color.atlasTexture;

            if (currentTexture && this._composer.width > 0) {
                // repaint the old canvas into the new one.
                newComposer.draw(
                    currentTexture,
                    new Rect(0, this._composer.width, 0, this._composer.height),
                );
                newTexture = newComposer.render();
            }

            this._composer.dispose();
            currentTexture?.dispose();
            this._composer = newComposer;

            for (let i = 0; i < this._colorLayers.length; i++) {
                const layer = this._colorLayers[i];
                const atlas = this._atlasInfo.atlas[layer.id];
                const pitch = this.texturesInfo.color.infos[i].originalOffsetScale;
                const texture = this.texturesInfo.color.infos[i].texture;

                // compute offset / scale
                const w = texture?.image?.width || EMPTY_IMAGE_SIZE;
                const h = texture?.image?.height || EMPTY_IMAGE_SIZE;
                const xRatio = w / this._composer.width;
                const yRatio = h / this._composer.height;
                this.texturesInfo.color.infos[i].offsetScale = new Vector4(
                    atlas.x / this._composer.width + pitch.x * xRatio,
                    (atlas.y + atlas.offset) / this._composer.height + pitch.y * yRatio,
                    pitch.z * xRatio,
                    pitch.w * yRatio,
                );
            }

            this.rebuildAtlasTexture(newTexture);
        }
        return this._composer.width > 0;
    }

    private rebuildAtlasTexture(newTexture: Texture) {
        if (newTexture) {
            newTexture.name = 'LayeredMaterial - Atlas';
        }
        this.texturesInfo.color.atlasTexture?.dispose();
        this.texturesInfo.color.atlasTexture = newTexture;
        this.uniforms.colorTexture.value = this.texturesInfo.color.atlasTexture;
    }

    changeState(state: RenderingState) {
        if (this.uniforms.renderingState.value === state) {
            return;
        }

        this.uniforms.renderingState.value = state;
        this._updateOpacityParameters(this.opacity);
        this._updateBlendingMode();

        this.needsUpdate = true;
    }

    _updateBlendingMode() {
        const state = this.uniforms.renderingState.value;
        if (state === RenderingState.FINAL) {
            this.transparent = this.opacity < 1 || this._options.backgroundOpacity < 1;
            this.needsUpdate = true;
            this.blending = NormalBlending;
        } else {
            // We cannot use alpha blending with custom rendering states because the alpha component
            // of the fragment in those modes has nothing to do with transparency at all.
            this.blending = NoBlending;
            this.transparent = false;
            this.needsUpdate = true;
        }
    }

    hasColorLayer(layer: ColorLayer) {
        return this.indexOfColorLayer(layer) !== -1;
    }

    indexOfColorLayer(layer: ColorLayer) {
        return this._colorLayers.indexOf(layer);
    }

    private _updateOpacityParameters(opacity: number) {
        this.uniforms.opacity.value = opacity;
        this._updateBlendingMode();
    }

    setLayerOpacity(layer: ColorLayer, opacity: number) {
        const index = this.indexOfColorLayer(layer);
        this.texturesInfo.color.infos[index].opacity = opacity;
        this._mustUpdateUniforms = true;
    }

    setLayerVisibility(layer: ColorLayer, visible: boolean) {
        const index = this.indexOfColorLayer(layer);
        this.texturesInfo.color.infos[index].visible = visible;
        this._mustUpdateUniforms = true;
    }

    setLayerElevationRange(layer: ColorLayer, range: ElevationRange) {
        if (range != null) {
            MaterialUtils.setDefine(this, 'ENABLE_ELEVATION_RANGE', true);
        }
        const index = this.indexOfColorLayer(layer);
        const value = range ? new Vector2(range.min, range.max) : DISABLED_ELEVATION_RANGE;
        this.texturesInfo.color.infos[index].elevationRange = value;
        this._mustUpdateUniforms = true;
    }

    setColorimetry(
        layer: ColorLayer,
        brightness: number,
        contrast: number,
        saturation: number,
    ) {
        const index = this.indexOfColorLayer(layer);
        this.texturesInfo.color.infos[index].brightnessContrastSaturation.set(
            brightness,
            contrast,
            saturation,
        );
        this._updateColorLayerUniforms();
    }

    canProcessColorLayer(): boolean {
        return this.isElevationLayerTextureLoaded();
    }

    isElevationLayerTextureLoaded() {
        if (!this._hasElevationLayer) {
            return true;
        }
        const texture = this.texturesInfo.elevation.texture;
        return texture != null && texture.isFinal === true;
    }

    isColorLayerTextureLoaded(layer: ColorLayer) {
        const index = this.indexOfColorLayer(layer);
        if (index < 0) {
            return null;
        }
        return this.texturesInfo.color.infos[index].texture !== emptyTexture;
    }

    /**
     * Gets the number of layers on this material.
     *
     * @returns The number of layers present on this material.
     */
    getLayerCount() {
        return (this._elevationLayer ? 1 : 0) + this._colorLayers.length;
    }

    /**
     * Gets the progress of the loading of textures on this material.
     * The progress is the number of currently present textures divided
     * by the number of expected textures.
     */
    get progress() {
        let total = 0;
        let weight = 0;
        if (this._elevationLayer != null) {
            if (this.isElevationLayerTextureLoaded()) {
                total += 1;
            }
            weight += 1;
        }

        for (const layer of this._colorLayers) {
            if (this.isColorLayerTextureLoaded(layer)) {
                total += 1;
            }
            weight += 1;
        }

        if (weight === 0) {
            // No layer present
            return 1;
        }

        return total / weight;
    }

    get loading() {
        return this.progress < 1;
    }

    setUuid(uuid: number) {
        this.uniforms.uuid.value = uuid;
    }
}

export default LayeredMaterial;
