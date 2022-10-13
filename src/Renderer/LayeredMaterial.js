import {
    CanvasTexture,
    Color,
    LinearFilter,
    RawShaderMaterial,
    ShaderChunk,
    Texture,
    Uniform,
    Vector2,
    Vector4,
} from 'three';
import RendererConstant from './RendererConstant.js';
import TileVS from './Shader/TileVS.glsl';
import TileFS from './Shader/TileFS.glsl';
import PrecisionQualifier from './Shader/Chunk/PrecisionQualifier.glsl';
import GetElevation from './Shader/Chunk/GetElevation.glsl';
import ComputeUV from './Shader/Chunk/ComputeUV.glsl';
import { ELEVATION_FORMAT } from '../utils/DEMUtils.js';

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
    constructor(options = {}, segments, atlasInfo) {
        super();

        this.atlasInfo = atlasInfo;
        this.defines.STITCHING = 1;
        if (options.hillshade) {
            this.defines.HILLSHADE = 1;
            this.hillshade = options.hillshade;
            this.uniforms.zenith = { type: 'f', value: this.hillshade.zenith };
            this.uniforms.azimuth = { type: 'f', value: this.hillshade.azimuth };
        }
        this.uniforms.segments = new Uniform(segments);
        if (options.side) {
            this.side = options.side;
        }
        this.uniforms.renderingState = new Uniform(RendererConstant.FINAL);

        this.defines.TEX_UNITS = 0;

        this.uniforms.showOutline = new Uniform(false);

        if (__DEBUG__) {
            this.defines.DEBUG = 1;
        }

        this.fragmentShader = TileFS;
        this.vertexShader = TileVS;

        this._canvas = document.createElement('canvas');
        this._canvas.width = atlasInfo.maxX;
        this._canvas.height = atlasInfo.maxY;

        this.pendingUpdates = [];

        this.texturesInfo = {
            color: {
                infos: [],
                atlasTexture: new CanvasTexture(this._canvas),
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
        this.texturesInfo.color.atlasTexture.needsUpdate = false;
    }

    get canvas() {
        // This ensure that the canvas is properly initialized.
        this.rebuildAtlasIfNecessary();
        return this._canvas;
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

        this.texturesInfo.color.atlasTexture.dispose();
        this.texturesInfo.elevation.texture.dispose();
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

        this.pendingUpdates.push(layer);

        if (this.setTimeoutId !== null) {
            clearTimeout(this.setTimeoutId);
        }
        this.setTimeoutId = setTimeout(() => {
            if (this.uniforms.colorTexture.value !== this.texturesInfo.color.atlasTexture) {
                this.uniforms.colorTexture.value = this.texturesInfo.color.atlasTexture;
                for (const l of this.colorLayers) {
                    if (this.pendingUpdates.indexOf(l) === -1) {
                        console.warn('no new texture for ', l.id, '. Redrawing the old one');
                        this.pendingUpdates.push(l);
                    }
                }
            }

            this.rebuildAtlasIfNecessary();

            // Draw scheduled textures in canvas
            for (const l of this.pendingUpdates) {
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
                    this.texturesInfo.color.atlasTexture,
                    atlas,
                    (texture.image === this._canvas) ? null : texture,
                    this.texturesInfo.color.infos[idx].offsetScale,
                    this.canvasRevision,
                ).then(() => this.canvasRevision++);
            }

            this.pendingUpdates.length = 0;
            this.texturesInfo.color.atlasTexture.needsUpdate = true;

            if (this.visible) {
                instance.notifyChange();
            }
            this.setTimeoutId = null;
        }, 1);

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
        } else if (layer.elevationFormat !== ELEVATION_FORMAT.NUMERIC) {
            throw new Error('Missing layer.elevationFormat handling', layer.elevationFormat);
        }
        this.uniforms.elevationTexture.value = textureAndPitch.texture;
        this.texturesInfo.elevation.texture = textureAndPitch.texture;
        this.texturesInfo.elevation.offsetScale.copy(textureAndPitch.pitch);
        this.texturesInfo.elevation.format = layer.elevationFormat;

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
        this.texturesInfo.color.infos.splice(index, 1);
        this.colorLayers.splice(index, 1);

        this.defines.TEX_UNITS = this.colorLayers.length;

        this.needsUpdate = true;
    }

    update(materialOptions = {}) {
        if (materialOptions.hillshade) {
            this.uniforms.zenith.value = materialOptions.hillshade.zenith;
            this.uniforms.azimuth.value = materialOptions.hillshade.azimuth;
        }
        if (this.colorLayers.length === 0) {
            return true;
        }
        return this.rebuildAtlasIfNecessary();
    }

    rebuildAtlasIfNecessary() {
        if (this.atlasInfo.maxX > this._canvas.width || this.atlasInfo.maxY > this._canvas.height) {
            // TODO: test this and then make providers draw directly in this._canvas
            const newCanvas = document.createElement('canvas');
            newCanvas.width = this.atlasInfo.maxX;
            newCanvas.height = this.atlasInfo.maxY;
            if (this._canvas.width > 0) {
                // repaint the old canvas into the new one.
                const ctx = newCanvas.getContext('2d');
                ctx.drawImage(this._canvas, 0, 0, this._canvas.width, this._canvas.height);
            }

            this.texturesInfo.color.atlasTexture.dispose();
            this.texturesInfo.color.atlasTexture = new CanvasTexture(newCanvas);
            this.texturesInfo.color.atlasTexture.magFilter = LinearFilter;
            this.texturesInfo.color.atlasTexture.minFilter = LinearFilter;
            this.texturesInfo.color.atlasTexture.anisotropy = 1;
            this.texturesInfo.color.atlasTexture.premultiplyAlpha = true;
            this.texturesInfo.color.atlasTexture.needsUpdate = true;

            for (let i = 0; i < this.colorLayers.length; i++) {
                const layer = this.colorLayers[i];
                const atlas = this.atlasInfo.atlas[layer.id];
                const pitch = this.texturesInfo.color.infos[i].originalOffsetScale;

                // compute offset / scale
                const xRatio = layer.imageSize.w / newCanvas.width;
                const yRatio = layer.imageSize.h / newCanvas.height;
                this.texturesInfo.color.infos[i].offsetScale = new Vector4(
                    atlas.x / newCanvas.width + pitch.x * xRatio,
                    (atlas.y + atlas.offset) / newCanvas.height + pitch.y * yRatio,
                    pitch.z * xRatio,
                    pitch.w * yRatio,
                );
            }
            this._canvas = newCanvas;
            this.uniforms.colorTexture.value = this.texturesInfo.color.atlasTexture;
        }
        return this._canvas.width > 0;
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

async function drawLayerOnCanvas(layer, atlasTexture, atlasInfo, texture) {
    /** @type {HTMLCanvasElement} */
    const canvas = atlasTexture.image;
    const ctx = canvas.getContext('2d');

    if (texture !== undefined && layer.transparent) {
        ctx.clearRect(
            atlasInfo.x, atlasInfo.y, layer.imageSize.w, layer.imageSize.h + 2 * atlasInfo.offset,
        );
    }

    if (texture && texture.image) {
        const dx = atlasInfo.x;
        const dy = atlasInfo.y + atlasInfo.offset;
        const dw = layer.imageSize.w;
        const dh = layer.imageSize.h;

        let bitmap = texture.image;

        // draw the whole image
        if (texture.isDataTexture) {
            // DataTexture.image is not an actual image that can be rendered into a canvas.
            // We have to create an ImageBitmap from the underlying data.
            bitmap = await createImageBitmap(texture.image.data);
        }

        ctx.drawImage(bitmap, dx, dy, dw, dh);
    }

    atlasTexture.needsUpdate = true;
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
