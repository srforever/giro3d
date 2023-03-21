import {
    Color,
    RawShaderMaterial,
    ShaderChunk,
    Texture,
    Uniform,
    Vector2,
    Vector4,
    DoubleSide,
    FrontSide,
    NormalBlending,
    NoBlending,
} from 'three';
import RenderingState from './RenderingState.js';
import TileVS from './shader/TileVS.glsl';
import TileFS from './shader/TileFS.glsl';
import PrecisionQualifier from './shader/chunk/PrecisionQualifier.glsl';
import ColorMapChunk from './shader/chunk/ColorMap.glsl';
import LayerInfoChunk from './shader/chunk/LayerInfo.glsl';
import GetElevation from './shader/chunk/GetElevation.glsl';
import ComputeUV from './shader/chunk/ComputeUV.glsl';
import WebGLComposer from './composition/WebGLComposer.js';
import Rect from '../core/Rect.js';
import MemoryTracker from './MemoryTracker.js';
import ElevationLayer from '../core/layer/ElevationLayer.js';
import ColorMap from '../core/layer/ColorMap.js';
import ColorMapAtlas from './ColorMapAtlas.js';

// Declaring our own chunks
ShaderChunk.PrecisionQualifier = PrecisionQualifier;
ShaderChunk.GetElevation = GetElevation;
ShaderChunk.ComputeUV = ComputeUV;
ShaderChunk.LayerInfo = LayerInfoChunk;
ShaderChunk.ColorMap = ColorMapChunk;

const emptyTexture = new Texture();

function makeArray(size) {
    const array = new Array(size);
    for (let i = 0; i < size; i++) {
        array[i] = {};
    }
    return array;
}

const COLORMAP_DISABLED = 0;

class TextureInfo {
    constructor(layer) {
        this.layer = layer;
        this.offsetScale = null;
        this.originalOffsetScale = null;
        this.texture = null;
        this.opacity = null;
        this.visible = null;
        this.color = null;
    }
}

// 'options' allows to define what is the datatype of the elevation textures used.
// By default, we assume floating-point textures.
// If the elevation textures are RGB, then 3 values must be set:
//   - useColorTextureElevation: declare that the elevation texture is an RGB textures.
//   - colorTextureElevationMinZ: altitude value mapped on the (0, 0, 0) color
//   - colorTextureElevationMaxZ: altitude value mapped on the (255, 255, 255) color
class LayeredMaterial extends RawShaderMaterial {
    constructor(options = {}, renderer, atlasInfo) {
        super();

        this.atlasInfo = atlasInfo;
        this.defines.STITCHING = 1;
        this.renderer = renderer;

        this.lightDirection = { azimuth: 315, zenith: 45 };
        this.uniforms.zenith = { type: 'f', value: 45 };
        this.uniforms.azimuth = { type: 'f', value: 135 };

        if (options.discardNoData) {
            this.defines.DISCARD_NODATA_ELEVATION = 1;
        }

        this.uniforms.segments = new Uniform(options.segments);

        this.side = options.doubleSided ? DoubleSide : FrontSide;

        this.uniforms.renderingState = new Uniform(RenderingState.FINAL);
        this._updateBlendingMode();

        this.defines.COLOR_LAYERS = 0;

        if (__DEBUG__) {
            this.defines.DEBUG = 1;
        }

        this.fragmentShader = TileFS;
        this.vertexShader = TileVS;

        this.composer = this.createComposer();

        this.texturesInfo = {
            color: {
                infos: [],
                atlasTexture: null,
                parentAtlasTexture: null,
            },
            elevation: {
                offsetScale: new Vector4(0, 0, 0, 0),
                texture: emptyTexture,
                format: null,
            },
        };

        this.canvasRevision = 0;

        this.uniforms.tileDimensions = new Uniform(new Vector2());
        this.uniforms.neighbours = new Uniform(new Array(8));
        for (let i = 0; i < 8; i++) {
            this.uniforms.neighbours.value[i] = {};
        }

        // Elevation texture
        const elevInfo = this.texturesInfo.elevation;
        this.uniforms.elevationTexture = new Uniform(elevInfo.texture);
        this.uniforms.elevationLayer = new Uniform({});

        // Color textures's layer
        this.uniforms.colorTexture = new Uniform(this.texturesInfo.color.atlasTexture);

        // Describe the properties of each color layer (offsetScale, color...).
        this.uniforms.layers = new Uniform([]);
        this.uniforms.layersColorMaps = new Uniform([]);
        this.uniforms.luts = new Uniform([]);

        this._updateColorLayerUniforms();

        this.uniforms.uuid = new Uniform(0);

        this.uniforms.backgroundColor = new Uniform(new Vector4());
        this.uniforms.opacity = new Uniform(1.0);

        this.colorLayers = [];

        this.update(options);

        if (__DEBUG__) {
            MemoryTracker.track(this, 'LayeredMaterial');
        }
    }

    get pixelWidth() {
        return this.composer.width;
    }

    get pixelHeight() {
        return this.composer.height;
    }

    set segments(v) {
        if (this.uniforms.segments.value !== v) {
            this.uniforms.segments.value = v;
        }
    }

    _updateColorLayerUniforms() {
        const layersUniform = [];
        const infos = this.texturesInfo.color.infos;

        for (const info of infos) {
            const offsetScale = info.offsetScale;
            const tex = info.texture;
            let textureSize = new Vector2(0, 0);
            if (tex.image) {
                textureSize = new Vector2(tex.image.width, tex.image.height);
            }

            const rgb = info.color;
            const a = info.visible ? info.opacity : 0;
            const color = new Vector4(rgb.r, rgb.g, rgb.b, a);

            layersUniform.push({
                offsetScale,
                color,
                textureSize,
            });
        }

        this.uniforms.layers.value = layersUniform;
    }

    dispose() {
        this.dispatchEvent({
            type: 'dispose',
        });
        this.disposed = true;

        for (const layer of this.colorLayers) {
            const index = this.indexOfColorLayer(layer);
            if (index === -1) {
                continue;
            }
            const tex = this.texturesInfo.color.infos[index].texture;
            if (tex && tex.dispose && tex.owner === this) {
                tex.dispose();
            }
            delete this.texturesInfo.color.infos[index];
        }

        this.colorLayers.length = 0;
        this.composer.dispose();
        this.texturesInfo.color.atlasTexture?.dispose();
        const elevTexture = this.texturesInfo.elevation.texture;
        if (elevTexture.owner === this) {
            elevTexture.dispose();
        }
    }

    getColorTexture(layer) {
        const index = this.indexOfColorLayer(layer);

        if (index === -1) {
            return null;
        }
        return this.texturesInfo.color.infos[index].texture;
    }

    setColorTextures(layer, textures, shortcut, instance, isInherited = false) {
        if (Array.isArray(textures)) {
            // console.warn(`Provider should return a single texture and not an Array.
            // See layer id = ${layer.id}`);
            textures = textures[0];
        }

        if (!isInherited) {
            textures.texture.owner = this;
        }

        const index = this.indexOfColorLayer(layer);
        this.texturesInfo.color.infos[index].originalOffsetScale.copy(textures.pitch);
        this.texturesInfo.color.infos[index].texture = textures.texture;

        if (shortcut) {
            const w = textures?.texture?.image?.width || layer.imageSize.w;
            const h = textures?.texture?.image?.height || layer.imageSize.h;
            updateOffsetScale(
                { w, h },
                this.atlasInfo.atlas[layer.id],
                this.texturesInfo.color.infos[index].originalOffsetScale,
                this.composer.width,
                this.composer.height,
                this.texturesInfo.color.infos[index].offsetScale,
            );
            // we already got our texture (needsUpdate is done in TiledNodeProcessing)
            return Promise.resolve();
        }

        this.rebuildAtlasIfNecessary();

        // Redraw all color layers on the canvas
        for (const l of this.colorLayers) {
            const idx = this.indexOfColorLayer(l);
            const atlas = this.atlasInfo.atlas[l.id];

            const texture = this.texturesInfo.color.infos[idx].texture;

            const w = texture?.image?.width || l.imageSize.w;
            const h = texture?.image?.height || l.imageSize.h;

            updateOffsetScale(
                { w, h },
                this.atlasInfo.atlas[l.id],
                this.texturesInfo.color.infos[idx].originalOffsetScale,
                this.composer.width,
                this.composer.height,
                this.texturesInfo.color.infos[idx].offsetScale,
            );

            if (texture) {
                drawImageOnAtlas(w, h, this.composer, atlas, texture);
            }

            this.canvasRevision++;
        }

        const texture = this.composer.render();

        // Even though we asked the composer to reuse the same texture, sometimes it has
        // to recreate a new texture when some parameters change, such as pixel format.
        if (texture.uuid !== this.texturesInfo.color.atlasTexture?.uuid) {
            this._rebuildAtlasTexture(texture);
        }

        this.uniforms.colorTexture.value = this.texturesInfo.color.atlasTexture;

        if (this.visible) {
            instance.notifyChange();
        }

        return Promise.resolve();
    }

    /**
     * Gets the elevation texture if an elevation layer texture has been loaded in this material.
     *
     * @returns {object|null} Returns the elevation texture or null
     */
    getElevationTextureInfo() {
        if (this.isElevationLayerTextureLoaded()) {
            return {
                texture: this.texturesInfo.elevation.texture,
                offsetScale: this.texturesInfo.elevation.offsetScale,
                heightFieldScale: this.texturesInfo.elevation.heightFieldScale,
                heightFieldOffset: this.texturesInfo.elevation.heightFieldOffset,
            };
        }
        return null;
    }

    setElevationTexture(layer, textureAndPitch, isInherited = false) {
        /** @type {ElevationLayer} */
        this.elevationLayer = layer;

        this._define('ELEVATION_LAYER', true);

        const texture = textureAndPitch.texture;
        this.uniforms.elevationTexture.value = texture;
        this.texturesInfo.elevation.texture = texture;
        this.texturesInfo.elevation.offsetScale.copy(textureAndPitch.pitch);

        const uniform = this.uniforms.elevationLayer.value;
        uniform.offsetScale = textureAndPitch.pitch;
        uniform.textureSize = new Vector2(texture.image.width, texture.image.height);
        uniform.color = new Vector4(1, 1, 1, 1);

        if (!isInherited) {
            texture.owner = this;
        }

        this._updateColorMaps();

        return Promise.resolve(true);
    }

    pushLayer(newLayer) {
        if (this.colorLayers.includes(newLayer)) {
            return;
        }
        this.colorLayers.push(newLayer);
        this.colorLayers.sort((a, b) => a.index - b.index);

        const info = new TextureInfo(newLayer);

        info.opacity = newLayer.opacity;
        info.visible = newLayer.visible;
        info.offsetScale = new Vector4(0, 0, 0, 0);
        info.originalOffsetScale = new Vector4(0, 0, 0, 0);
        info.texture = emptyTexture;
        info.color = newLayer.color || new Color(1, 1, 1);

        this.texturesInfo.color.infos.push(info);
        this.texturesInfo.color.infos.sort((a, b) => a.index - b.index);

        this._updateColorLayerUniforms();

        this._updateColorMaps();

        this.defines.COLOR_LAYERS = this.colorLayers.length;
        this.needsUpdate = true;
    }

    removeLayer(layer) {
        const index = this.indexOfColorLayer(layer);
        if (index === -1) {
            console.warn(`Layer ${layer.id} not found, so not removed...`);
            return;
        }
        // NOTE: we cannot dispose the texture here, because it might be cached for later.
        this.texturesInfo.color.infos.splice(index, 1);
        this.colorLayers.splice(index, 1);

        this._updateColorLayerUniforms();

        this._updateColorMaps();

        this.defines.COLOR_LAYERS = this.colorLayers.length;

        this.needsUpdate = true;
    }

    /**
     * Returns or create a uniform by name.
     *
     * @param {string} name The uniform name.
     * @param {any} value the value to set
     * @returns {Uniform} The resulting uniform
     */
    getObjectUniform(name, value = {}) {
        let uniform;

        if (!this.uniforms[name]) {
            uniform = new Uniform(value);
            this.uniforms[name] = uniform;
        } else {
            uniform = this.uniforms[name];
            uniform.value = value;
        }
        return uniform;
    }

    /**
     * @param {ColorMapAtlas} atlas The color map atlas.
     */
    _updateColorMaps(atlas) {
        const elevationColorMap = this.elevationLayer?.colorMap;

        const elevationUniform = this.getObjectUniform('elevationColorMap');
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
            /** @type {ColorMap} */
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
            if (!this.uniforms.luts) {
                this.uniforms.luts = new Uniform(luts);
            }
            this.uniforms.luts.value = luts;
        }
    }

    _define(name, condition) {
        if (this.defines[name] === undefined) {
            if (condition) {
                this.defines[name] = 1;
                this.needsUpdate = true;
            }
        } else if (!condition) {
            delete this.defines[name];
            this.needsUpdate = true;
        }
    }

    update(materialOptions = {}) {
        this.uniforms.zenith.value = this.lightDirection.zenith;
        this.uniforms.azimuth.value = this.lightDirection.azimuth;

        if (materialOptions.colorMapAtlas) {
            this._updateColorMaps(materialOptions.colorMapAtlas);
        }

        if (materialOptions.backgroundColor) {
            const a = materialOptions.backgroundOpacity;
            const c = materialOptions.backgroundColor;
            const vec4 = new Vector4(c.r, c.g, c.b, a);
            this.uniforms.backgroundColor.value.copy(vec4);
        }

        this._define('ELEVATION_LAYER', this.elevationLayer?.visible);
        this._define('ENABLE_HILLSHADING', materialOptions.hillshading);
        this._define('ENABLE_OUTLINES', this.showOutline);

        const newSide = materialOptions.doubleSided ? DoubleSide : FrontSide;
        if (this.side !== newSide) {
            this.side = newSide;
            this.needsUpdate = true;
        }

        if (this.colorLayers.length === 0) {
            return true;
        }
        return this.rebuildAtlasIfNecessary();
    }

    createComposer() {
        const newComposer = new WebGLComposer({
            extent: new Rect(0, this.atlasInfo.maxX, 0, this.atlasInfo.maxY),
            width: this.atlasInfo.maxX,
            height: this.atlasInfo.maxY,
            reuseTexture: true,
            webGLRenderer: this.renderer,
        });
        return newComposer;
    }

    rebuildAtlasIfNecessary() {
        if (this.atlasInfo.maxX > this.composer.width
            || this.atlasInfo.maxY > this.composer.height) {
            const newComposer = this.createComposer();

            let newTexture;

            const currentTexture = this.texturesInfo.color.atlasTexture;

            if (currentTexture && this.composer.width > 0) {
                // repaint the old canvas into the new one.
                newComposer.draw(
                    currentTexture,
                    new Rect(0, this.composer.width, 0, this.composer.height),
                );
                newTexture = newComposer.render();
            }

            this.composer.dispose();
            this.composer = newComposer;

            for (let i = 0; i < this.colorLayers.length; i++) {
                const layer = this.colorLayers[i];
                const atlas = this.atlasInfo.atlas[layer.id];
                const pitch = this.texturesInfo.color.infos[i].originalOffsetScale;
                const texture = this.texturesInfo.color.infos[i].texture;

                // compute offset / scale
                const w = texture?.image?.width || layer.imageSize.w;
                const h = texture?.image?.height || layer.imageSize.h;
                const xRatio = w / this.composer.width;
                const yRatio = h / this.composer.height;
                this.texturesInfo.color.infos[i].offsetScale = new Vector4(
                    atlas.x / this.composer.width + pitch.x * xRatio,
                    (atlas.y + atlas.offset) / this.composer.height + pitch.y * yRatio,
                    pitch.z * xRatio,
                    pitch.w * yRatio,
                );
            }

            this._rebuildAtlasTexture(newTexture);
        }
        return this.composer.width > 0;
    }

    _rebuildAtlasTexture(newTexture) {
        this.texturesInfo.color.atlasTexture?.dispose();
        this.texturesInfo.color.atlasTexture = newTexture;
        this.uniforms.colorTexture.value = this.texturesInfo.color.atlasTexture;
    }

    changeState(state) {
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
            this.transparent = true;
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

    indexOfColorLayer(layer) {
        return this.colorLayers.indexOf(layer);
    }

    setOpacity(opacity) {
        this.opacity = opacity;

        this._updateOpacityParameters(opacity);
    }

    _updateOpacityParameters(opacity) {
        this.uniforms.opacity.value = opacity;
        this._updateBlendingMode();
    }

    setLayerOpacity(layer, opacity) {
        const index = Number.isInteger(layer) ? layer : this.indexOfColorLayer(layer);
        this.texturesInfo.color.infos[index].opacity = opacity;
        this._updateColorLayerUniforms();
    }

    setLayerVisibility(layer, visible) {
        const index = Number.isInteger(layer) ? layer : this.indexOfColorLayer(layer);
        this.texturesInfo.color.infos[index].visible = visible;
        this._updateColorLayerUniforms();
    }

    isElevationLayerTextureLoaded() {
        return this.texturesInfo.elevation.texture !== emptyTexture;
    }

    isColorLayerTextureLoaded(layer) {
        const index = this.indexOfColorLayer(layer);
        if (index < 0) {
            return null;
        }
        return this.texturesInfo.color.infos[index].texture !== emptyTexture;
    }

    setUuid(uuid) {
        this.uniforms.uuid.value = uuid;
    }
}

function drawImageOnAtlas(width, height, composer, atlasInfo, texture) {
    const dx = atlasInfo.x;
    const dy = atlasInfo.y + atlasInfo.offset;
    const dw = width;
    const dh = height;

    const rect = new Rect(dx, dx + dw, dy, dy + dh);

    composer.draw(texture, rect);
}

function updateOffsetScale(imageSize, atlas, originalOffsetScale, width, height, target) {
    if (originalOffsetScale.z === 0 || originalOffsetScale.w === 0) {
        target.set(0, 0, 0, 0);
        return;
    }
    // compute offset / scale
    const xRatio = imageSize.w / width;
    const yRatio = imageSize.h / height;

    target.set(
        atlas.x / width + originalOffsetScale.x * xRatio,
        (atlas.y + atlas.offset) / height + originalOffsetScale.y * yRatio,
        originalOffsetScale.z * xRatio,
        originalOffsetScale.w * yRatio,
    );
}

export default LayeredMaterial;
