import {
    Color,
    DataTexture,
    FloatType,
    LinearFilter,
    RawShaderMaterial,
    RGBFormat,
    ShaderChunk,
    Texture,
    Uniform,
    UnsignedByteType,
    Vector2,
    Vector4,
    DoubleSide,
    FrontSide,
} from 'three';
import RendererConstant from './RendererConstant.js';
import TileVS from './Shader/TileVS.glsl';
import TileFS from './Shader/TileFS.glsl';
import PrecisionQualifier from './Shader/Chunk/PrecisionQualifier.glsl';
import GetElevation from './Shader/Chunk/GetElevation.glsl';
import ComputeUV from './Shader/Chunk/ComputeUV.glsl';
import { ELEVATION_FORMAT } from '../utils/DEMUtils.js';
import WebGLComposer from './composition/WebGLComposer.js';
import Rect from '../Core/Rect.js';
import MemoryTracker from './MemoryTracker.js';

// Declaring our own chunks
ShaderChunk.PrecisionQualifier = PrecisionQualifier;
ShaderChunk.GetElevation = GetElevation;
ShaderChunk.ComputeUV = ComputeUV;

const emptyTexture = new Texture();
const vector4 = new Vector4(0.0, 0.0, 0.0, 0.0);

// from js packDepthToRGBA
const UnpackDownscale = 255 / 256; // 0..1 -> fraction (excluding 1)
export function unpack1K(color, factor) {
    const bitSh = new Vector4(
        UnpackDownscale / (256.0 * 256.0 * 256.0),
        UnpackDownscale / (256.0 * 256.0),
        UnpackDownscale / 256.0,
        UnpackDownscale,
    );
    return factor ? bitSh.dot(color) * factor : bitSh.dot(color);
}

// Array not suported in IE
function fillArray(array, remp) {
    for (let i = 0; i < array.length; i++) {
        array[i] = remp;
    }
}

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
    constructor(options = {}, renderer, geometryProps, atlasInfo) {
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

        const geometryDim = new Vector2(geometryProps.width - 1, geometryProps.height - 1);
        this.uniforms.geometryDim = new Uniform(geometryDim);

        this.side = options.doubleSided ? DoubleSide : FrontSide;

        this.uniforms.renderingState = new Uniform(RendererConstant.FINAL);

        this.defines.TEX_UNITS = 0;

        if (__DEBUG__) {
            this.defines.DEBUG = 1;
        }

        this.fragmentShader = TileFS;
        this.vertexShader = TileVS;

        this.composer = this.createComposer();

        this.texturesInfo = {
            color: {
                infos: [],
                atlasTexture: this.composer.texture,
                parentAtlasTexture: null,
            },
            elevation: {
                offsetScale: new Vector4(0, 0, 0, 0),
                texture: emptyTexture,
                neighbours: {
                    offsetScale: Array(4),
                    texture: Array(4),
                },
                format: null,
            },
        };
        fillArray(this.texturesInfo.elevation.neighbours.texture, emptyTexture);
        fillArray(this.texturesInfo.elevation.neighbours.offsetScale, vector4);

        this.canvasRevision = 0;

        this.uniforms.tileDimensions = new Uniform(new Vector2());
        this.uniforms.neighbourdiffLevel = new Uniform(new Vector4());

        // Elevation texture
        this.uniforms.elevationTexture = new Uniform(this.texturesInfo.elevation.texture);
        this.uniforms.elevationOffsetScale = new Uniform(
            this.texturesInfo.elevation.offsetScale,
        );
        this.uniforms.elevationTextureSize = new Uniform(new Vector2());
        this.uniforms.nTex = new Uniform(this.texturesInfo.elevation.neighbours.texture);
        this.uniforms.nOff = new Uniform(this.texturesInfo.elevation.neighbours.offsetScale);

        // Color textures's layer
        this.uniforms.colorTexture = new Uniform(this.texturesInfo.color.atlasTexture);

        this.uniforms.colorOffsetScale = new Uniform();
        this.uniforms.colorOpacity = new Uniform();
        this.uniforms.colorVisible = new Uniform();
        this.uniforms.colors = new Uniform();

        this.updateLayerUniforms();

        this.uniforms.uuid = new Uniform(0);

        this.uniforms.noTextureColor = new Uniform(new Color());
        this.uniforms.noTextureOpacity = new Uniform(1.0);

        this.uniforms.opacity = new Uniform(1.0);

        this.colorLayers = [];
        this.texturesInfo.color.atlasTexture.generateMipmaps = false;
        this.texturesInfo.color.atlasTexture.magFilter = LinearFilter;
        this.texturesInfo.color.atlasTexture.minFilter = LinearFilter;
        this.texturesInfo.color.atlasTexture.anisotropy = 1;
        this.texturesInfo.color.atlasTexture.premultiplyAlpha = true;

        if (__DEBUG__) {
            MemoryTracker.track(this, 'LayeredMaterial');
        }
    }

    updateLayerUniforms() {
        const infos = this.texturesInfo.color.infos;
        this.uniforms.colorOffsetScale.value = infos.map(x => x.offsetScale);
        this.updateOpacityUniform();
        this.uniforms.colorVisible.value = infos.map(x => x.visible);
        this.uniforms.colors.value = infos.map(x => x.color);
    }

    updateOpacityUniform() {
        this.uniforms.colorOpacity.value = this.texturesInfo.color.infos.map(x => x.opacity);
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
            if (tex && tex.dispose) {
                tex.dispose();
            }
            delete this.texturesInfo.color.infos[index];
        }

        this.colorLayers.length = 0;
        this.composer.dispose();
        this.texturesInfo.color.atlasTexture.dispose();
        this.texturesInfo.elevation.texture.dispose();
        if (this.uniforms.vLut) {
            this.uniforms.vLut.value.dispose();
        }
    }

    getColorTexture(layer) {
        const index = this.indexOfColorLayer(layer);

        if (index === -1) {
            return null;
        }
        return this.texturesInfo.color.infos[index].texture;
    }

    setColorTextures(layer, textures, shortcut, instance) {
        if (Array.isArray(textures)) {
            // console.warn(`Provider should return a single texture and not an Array.
            // See layer id = ${layer.id}`);
            textures = textures[0];
        }

        const index = this.indexOfColorLayer(layer);
        this.texturesInfo.color.infos[index].originalOffsetScale.copy(textures.pitch);
        this.texturesInfo.color.infos[index].texture = textures.texture;

        if (shortcut) {
            updateOffsetScale(
                layer.imageSize,
                this.atlasInfo.atlas[layer.id],
                this.texturesInfo.color.infos[index].originalOffsetScale,
                this.uniforms.colorTexture.value.image,
                this.texturesInfo.color.infos[index].offsetScale,
            );
            // we already got our texture (needsUpdate is done in TiledNodeProcessing)
            return Promise.resolve();
        }

        if (this.uniforms.colorTexture.value !== this.texturesInfo.color.atlasTexture) {
            this.uniforms.colorTexture.value = this.texturesInfo.color.atlasTexture;
        }

        this.rebuildAtlasIfNecessary();

        // Redraw all color layers on the canvas
        for (const l of this.colorLayers) {
            const idx = this.indexOfColorLayer(l);
            const atlas = this.atlasInfo.atlas[l.id];

            updateOffsetScale(
                l.imageSize,
                this.atlasInfo.atlas[l.id],
                this.texturesInfo.color.infos[idx].originalOffsetScale,
                this.uniforms.colorTexture.value.image,
                this.texturesInfo.color.infos[idx].offsetScale,
            );

            const texture = this.texturesInfo.color.infos[idx].texture;

            drawLayerOnCanvas(
                l,
                this.composer,
                atlas,
                (texture.image === this.composer) ? null : texture,
                this.texturesInfo.color.infos[idx].offsetScale,
                this.canvasRevision,
            );

            this.canvasRevision++;
        }

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
                elevationFormat: this.texturesInfo.elevation.format,
                heightFieldScale: this.texturesInfo.elevation.heightFieldScale,
                heightFieldOffset: this.texturesInfo.elevation.heightFieldOffset,
            };
        }
        return null;
    }

    setElevationTexture(layer, textureAndPitch) {
        if (layer.elevationFormat === ELEVATION_FORMAT.MAPBOX_RGB) {
            if (!this.defines.MAPBOX_RGB_ELEVATION) {
                this.defines.MAPBOX_RGB_ELEVATION = 1;
                this.needsUpdate = true;
            }
        } else if (layer.elevationFormat === ELEVATION_FORMAT.HEIGHFIELD) {
            if (!this.defines.HEIGHTFIELD_ELEVATION) {
                this.defines.HEIGHTFIELD_ELEVATION = 1;

                const heightFieldOffset = layer.heightFieldOffset || 0.0;
                this.texturesInfo.elevation.heightFieldOffset = heightFieldOffset;
                this.uniforms.heightFieldOffset = new Uniform(heightFieldOffset);
                const heightFieldScale = layer.heightFieldScale || 255.0;
                this.texturesInfo.elevation.heightFieldScale = heightFieldScale;
                this.uniforms.heightFieldScale = new Uniform(heightFieldScale);
                this.needsUpdate = true;
            }
        } else if (layer.elevationFormat === ELEVATION_FORMAT.RATP_GEOL) {
            if (!this.defines.RATP_GEOL_ELEVATION) {
                this.defines.RATP_GEOL_ELEVATION = 1;
            }
        } else if (layer.elevationFormat === ELEVATION_FORMAT.NUMERIC) {
            if (textureAndPitch.texture.type === FloatType) {
                // In the case of raw, float textures, we don't want to apply scaling in the shader.
                this.defines.RAW_ELEVATION = 1;
                delete this.defines.HEIGHTFIELD_ELEVATION;
            } else {
                this.defines.HEIGHTFIELD_ELEVATION = 1;
                delete this.defines.RAW_ELEVATION;
            }
            const heightFieldOffset = layer.minmax.min;
            this.texturesInfo.elevation.heightFieldOffset = heightFieldOffset;
            this.uniforms.heightFieldOffset = new Uniform(heightFieldOffset);
            const heightFieldScale = layer.minmax.max - layer.minmax.min;
            this.texturesInfo.elevation.heightFieldScale = heightFieldScale;
            this.uniforms.heightFieldScale = new Uniform(heightFieldScale);
            this.needsUpdate = true;
        } else {
            throw new Error('Missing layer.elevationFormat handling', layer.elevationFormat);
        }
        const texture = textureAndPitch.texture;
        this.uniforms.elevationTexture.value = texture;
        this.texturesInfo.elevation.texture = texture;
        this.texturesInfo.elevation.offsetScale.copy(textureAndPitch.pitch);
        this.texturesInfo.elevation.format = layer.elevationFormat;
        this.uniforms.elevationTextureSize.value.set(texture.image.width, texture.image.height);

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

        this.updateLayerUniforms();

        this.defines.TEX_UNITS = this.colorLayers.length;
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

        this.defines.TEX_UNITS = this.colorLayers.length;

        this.needsUpdate = true;
    }

    update(materialOptions = {}) {
        let recompileShaders = false;
        this.uniforms.zenith.value = this.lightDirection.zenith;
        this.uniforms.azimuth.value = this.lightDirection.azimuth;

        if (materialOptions.colormap) {
            if (!this.defines.COLORMAP) {
                this.defines.COLORMAP = 1;
                recompileShaders = true;
            }
            // Recreate uniforms if necessary
            if (!this.uniforms.colormapMode) {
                this.uniforms.colormapMode = { type: 'i', value: materialOptions.colormap.mode };
                this.uniforms.colormapMin = { type: 'f', value: materialOptions.colormap.min };
                this.uniforms.colormapMax = { type: 'f', value: materialOptions.colormap.max };
                this.uniforms.vLut = new Uniform();
            }
            this.uniforms.colormapMode.value = materialOptions.colormap.mode;
            this.uniforms.colormapMin.value = materialOptions.colormap.min;
            this.uniforms.colormapMax.value = materialOptions.colormap.max;

            // Update the LUT texture if it has changed
            const lut = materialOptions.colormap.lut;
            if (!this.uniforms.vLut.value
                || this.uniforms.vLut.value.image.data !== lut) {
                if (this.uniforms.vLut.value) {
                    this.uniforms.vLut.value.dispose();
                }
                this.uniforms.vLut.value = new DataTexture(
                    lut, lut.length / 3, 1, RGBFormat, FloatType,
                );
            }
        } else if (this.defines.COLORMAP) {
            delete this.defines.COLORMAP;
            recompileShaders = true;
        }

        if (materialOptions.hillshading && !this.defines.HILLSHADE) {
            this.defines.HILLSHADE = 1;
            recompileShaders = true;
        } else if (!materialOptions.hillshading && this.defines.HILLSHADE) {
            delete this.defines.HILLSHADE;
            recompileShaders = true;
        }

        if (this.showOutline && !this.defines.OUTLINES) {
            this.defines.OUTLINES = 1;
            recompileShaders = true;
        } else if (!this.showOutline && this.defines.OUTLINES) {
            delete this.defines.OUTLINES;
            recompileShaders = true;
        }

        const newSide = materialOptions.doubleSided ? DoubleSide : FrontSide;
        if (this.side !== newSide) {
            this.side = newSide;
            this.needsUpdate = true;
        }

        this.needsUpdate |= recompileShaders;

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
            renderToCanvas: false,
            pixelType: UnsignedByteType, //  FloatType if we need to support non 8-bit color images
            webGLRenderer: this.renderer,
        });
        return newComposer;
    }

    rebuildAtlasIfNecessary() {
        if (this.atlasInfo.maxX > this.composer.width
            || this.atlasInfo.maxY > this.composer.height) {
            const newComposer = this.createComposer();

            if (this.composer.width > 0) {
                // repaint the old canvas into the new one.
                newComposer.draw(
                    this.composer.texture,
                    new Rect(0, this.composer.width, 0, this.composer.height),
                );
                newComposer.render();
            }

            this.composer.dispose();
            this.texturesInfo.color.atlasTexture.dispose();
            this.composer = newComposer;
            this.texturesInfo.color.atlasTexture = this.composer.texture;
            this.texturesInfo.color.atlasTexture.magFilter = LinearFilter;
            this.texturesInfo.color.atlasTexture.minFilter = LinearFilter;
            this.texturesInfo.color.atlasTexture.anisotropy = 1;
            this.texturesInfo.color.atlasTexture.premultiplyAlpha = true;

            for (let i = 0; i < this.colorLayers.length; i++) {
                const layer = this.colorLayers[i];
                const atlas = this.atlasInfo.atlas[layer.id];
                const pitch = this.texturesInfo.color.infos[i].originalOffsetScale;

                // compute offset / scale
                const xRatio = layer.imageSize.w / this.composer.width;
                const yRatio = layer.imageSize.h / this.composer.height;
                this.texturesInfo.color.infos[i].offsetScale = new Vector4(
                    atlas.x / this.composer.width + pitch.x * xRatio,
                    (atlas.y + atlas.offset) / this.composer.height + pitch.y * yRatio,
                    pitch.z * xRatio,
                    pitch.w * yRatio,
                );
            }
            this.uniforms.colorTexture.value = this.texturesInfo.color.atlasTexture;
        }
        return this.composer.width > 0;
    }

    indexOfColorLayer(layer) {
        return this.colorLayers.indexOf(layer);
    }

    setLayerOpacity(layer, opacity) {
        const index = Number.isInteger(layer) ? layer : this.indexOfColorLayer(layer);
        this.texturesInfo.color.infos[index].opacity = opacity;
        this.updateOpacityUniform();
    }

    setLayerVisibility(layer, visible) {
        const index = Number.isInteger(layer) ? layer : this.indexOfColorLayer(layer);
        this.texturesInfo.color.infos[index].visible = visible;
        this.updateLayerUniforms();
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

function drawLayerOnCanvas(layer, composer, atlasInfo, texture) {
    if (texture) {
        const dx = atlasInfo.x;
        const dy = atlasInfo.y + atlasInfo.offset;
        const dw = layer.imageSize.w;
        const dh = layer.imageSize.h;

        const rect = new Rect(dx, dx + dw, dy, dy + dh);

        composer.clear(rect);

        composer.draw(texture, rect);

        composer.render();
    }
}

function updateOffsetScale(imageSize, atlas, originalOffsetScale, canvas, target) {
    if (originalOffsetScale.z === 0 || originalOffsetScale.w === 0) {
        target.set(0, 0, 0, 0);
        return;
    }
    // compute offset / scale
    const xRatio = imageSize.w / canvas.width;
    const yRatio = imageSize.h / canvas.height;

    target.set(
        atlas.x / canvas.width + originalOffsetScale.x * xRatio,
        (atlas.y + atlas.offset) / canvas.height + originalOffsetScale.y * yRatio,
        originalOffsetScale.z * xRatio,
        originalOffsetScale.w * yRatio,
    );
}

export default LayeredMaterial;
