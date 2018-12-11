import * as THREE from 'three';
import TileVS from './Shader/TileVS.glsl';
import TileFS from './Shader/TileFS.glsl';
import PrecisionQualifier from './Shader/Chunk/PrecisionQualifier.glsl';
import GetElevation from './Shader/Chunk/GetElevation.glsl';
import ComputeUV from './Shader/Chunk/ComputeUV.glsl';
import { ELEVATION_FORMAT } from '../Process/ElevationTextureProcessing';

// Declaring our own chunks
THREE.ShaderChunk.PrecisionQualifier = PrecisionQualifier;
THREE.ShaderChunk.GetElevation = GetElevation;
THREE.ShaderChunk.ComputeUV = ComputeUV;

const emptyTexture = new THREE.Texture();
const vector4 = new THREE.Vector4(0.0, 0.0, 0.0, 0.0);

// from three.js packDepthToRGBA
const UnpackDownscale = 255 / 256; // 0..1 -> fraction (excluding 1)
export function unpack1K(color, factor) {
    var bitSh = new THREE.Vector4(
        UnpackDownscale / (256.0 * 256.0 * 256.0),
        UnpackDownscale / (256.0 * 256.0),
        UnpackDownscale / 256.0,
        UnpackDownscale);
    return factor ? bitSh.dot(color) * factor : bitSh.dot(color);
}

// Array not suported in IE
function fillArray(array, remp) {
    for (let i = 0; i < array.length; i++) {
        array[i] = remp;
    }
}

// 'options' allows to define what is the datatype of the elevation textures used.
// By default, we assume floating-point textures.
// If the elevation textures are RGB, then 3 values must be set:
//   - useColorTextureElevation: declare that the elevation texture is an RGB textures.
//   - colorTextureElevationMinZ: altitude value mapped on the (0, 0, 0) color
//   - colorTextureElevationMaxZ: altitude value mapped on the (255, 255, 255) color
const LayeredMaterial = function LayeredMaterial(options, segments, atlasInfo) {
    THREE.RawShaderMaterial.call(this);

    options = options || { };
    this.atlasInfo = atlasInfo;
    // this.defines.HILLSHADE = 1;
    this.defines.STITCHING = 1;
    this.uniforms.segments = new THREE.Uniform(segments);
    if (options.side) {
        this.side = options.side;
    }

    this.defines.TEX_UNITS = 0;
    this.defines.INSERT_TEXTURE_READING_CODE = '';

    if (false || __DEBUG__) {
        this.defines.DEBUG = 1;
        this.uniforms.showOutline = new THREE.Uniform(true);
    }
    this.extensions.derivatives = true;

    this.fragmentShader = TileFS;
    this.vertexShader = TileVS;

    this.canvas = document.createElement('canvas');
    this.canvas.width = atlasInfo.maxX;
    this.canvas.height = atlasInfo.maxY;

    this.pendingUpdates = [];

    this.texturesInfo = {
        color: {
            offsetScale: [],
            atlasTexture: new THREE.CanvasTexture(this.canvas),
            parentAtlasTexture: null,
            textures: [],
            opacity: [],
            visible: [],
        },
        elevation: {
            offsetScale: new THREE.Vector4(0, 0, 0, 0),
            texture: emptyTexture,
            neighbours: {
                offsetScale: Array(4),
                texture: Array(4),
            },
        },
    };
    fillArray(this.texturesInfo.elevation.neighbours.texture, emptyTexture);
    fillArray(this.texturesInfo.elevation.neighbours.offsetScale, vector4);

    this.canvasRevision = 0;

    this.uniforms.tileDimensions = new THREE.Uniform(new THREE.Vector2());
    this.uniforms.neighbourdiffLevel = new THREE.Uniform(new THREE.Vector4());

    // Elevation texture
    this.uniforms.elevationTexture = new THREE.Uniform(this.texturesInfo.elevation.texture);
    this.uniforms.elevationOffsetScale = new THREE.Uniform(this.texturesInfo.elevation.offsetScale);
    this.uniforms.nTex = new THREE.Uniform(this.texturesInfo.elevation.neighbours.texture);
    this.uniforms.nOff = new THREE.Uniform(this.texturesInfo.elevation.neighbours.offsetScale);

    // Color textures's layer
    this.uniforms.colorTexture = new THREE.Uniform(this.texturesInfo.color.atlasTexture);
    this.uniforms.colorOffsetScale = new THREE.Uniform(); //this.texturesInfo.color.offsetScale);
    this.uniforms.colorOpacity = new THREE.Uniform(); //this.texturesInfo.color.opacity);
    this.uniforms.colorVisible = new THREE.Uniform(); //this.texturesInfo.color.visible);

    this.uniforms.uuid = new THREE.Uniform(0);

    this.uniforms.noTextureColor = new THREE.Uniform(new THREE.Color(0.04, 0.23, 0.35));

    this.uniforms.opacity = new THREE.Uniform(1.0);

    this.colorLayers = [];

    this.texturesInfo.color.atlasTexture.generateMipmaps = false;
    this.texturesInfo.color.atlasTexture.magFilter = THREE.LinearFilter;
    this.texturesInfo.color.atlasTexture.minFilter = THREE.LinearFilter;
    this.texturesInfo.color.atlasTexture.anisotropy = 1;
    this.texturesInfo.color.atlasTexture.premultiplyAlpha = true;
    this.texturesInfo.color.atlasTexture.needsUpdate = false;
};

LayeredMaterial.prototype = Object.create(THREE.RawShaderMaterial.prototype);
LayeredMaterial.prototype.constructor = LayeredMaterial;

LayeredMaterial.prototype.dispose = function dispose() {
    this.dispatchEvent({
        type: 'dispose',
    });

    for (const tex of this.texturesInfo.color.textures) {
        tex.dispose();
    }
    this.texturesInfo.elevation.texture.dispose();
};


LayeredMaterial.prototype.getLayerTexture = function getLayerTexture(layer) {
    if (layer.type === 'elevation') {
        return {
            texture: this.texturesInfo.elevation.texture,
            offsetScale: this.texturesInfo.elevation.offsetScale,
        };
    }

    const index = this.indexOfColorLayer(layer);

    if (index !== -1) {
        return {
            texture: this.texturesInfo.color.textures[index],
            // offsetScale: this.texturesInfo.color.offsetScale[index],
        };
    } else {
        // throw new Error(`Invalid layer "${layer}"`);
    }
};

function drawLayerOnCanvas(layer, atlasTexture, atlasInfo, image, interest, revision) {
    const canvas = atlasTexture.image;
    const ctx = canvas.getContext('2d');

    // TODO: only if !opaque
    ctx.clearRect(atlasInfo.x, atlasInfo.y, layer.imageSize.w, layer.imageSize.h + 2 * atlasInfo.offset);

    if (image) {
        // draw the whole image
        ctx.drawImage(
            image,
            atlasInfo.x, atlasInfo.y + atlasInfo.offset,
            layer.imageSize.w, layer.imageSize.h);

        if (atlasInfo.offset) {
            // avoid texture bleeding: repeat the first/last row
            ctx.drawImage(
                image,
                0, 0, layer.imageSize.w, atlasInfo.offset,
                atlasInfo.x, atlasInfo.y,
                layer.imageSize.w, atlasInfo.offset);
            ctx.drawImage(
                image,
                0, layer.imageSize.h - 1 - atlasInfo.offset, layer.imageSize.w, atlasInfo.offset,
                atlasInfo.x, atlasInfo.y + layer.imageSize.h + atlasInfo.offset,
                layer.imageSize.w, atlasInfo.offset);
        }


        // draw area of interest
        // ctx.strokeStyle = "green";
        // ctx.strokeRect(
        //     interest.x * canvas.width,
        //     interest.y * canvas.height,
        //     interest.z * canvas.width,
        //     interest.w * canvas.height);
    }
    else {
        // ctx.moveTo(atlasInfo.x, atlasInfo.y);
        // ctx.lineTo(atlasInfo.x + layer.imageSize.w, atlasInfo.y + layer.imageSize.h);
        // ctx.moveTo(atlasInfo.x + layer.imageSize.w, atlasInfo.y);
        // ctx.lineTo(atlasInfo.x, atlasInfo.y + layer.imageSize.h);
        // ctx.stroke();
    }
    // ctx.font = '24px serif';
    // ctx.fillText(`${revision}:${atlasInfo.x},${atlasInfo.y} ${layer.imageSize.w}x${layer.imageSize.h}`, atlasInfo.x, atlasInfo.y + layer.imageSize.h * 0.5);
    atlasTexture.needsUpdate = true;
    return revision + 1;
}

LayeredMaterial.prototype.setLayerTextures = function setLayerTextures(layer, textures, nope, view) {
    if (Array.isArray(textures)) {
        // console.warn(`Provider should return a single texture and not an Array. See layer id = ${layer.id}`);
        textures = textures[0];
    }

    if (layer.type === 'elevation') {
        if (layer.format == ELEVATION_FORMAT.MAPBOX_RGB) {
            if (!this.defines.MAPBOX_RGB_ELEVATION) {
                this.defines.MAPBOX_RGB_ELEVATION = 1;
                this.needsUpdate = true;
            }
        } else if (layer.format == ELEVATION_FORMAT.HEIGHFIELD) {
            if (!this.defines.HEIGHTFIELD_ELEVATION) {
                this.defines.HEIGHTFIELD_ELEVATION = 1;
                this.needsUpdate = true;
            }
        }
        this.texturesInfo.elevation.texture = textures.texture;
        this.uniforms.elevationTexture.value = textures.texture;
        this.texturesInfo.elevation.offsetScale.copy(textures.pitch);

        return Promise.resolve(true);
    } else if (layer.type === 'color') {
        const index = this.indexOfColorLayer(layer);
        const atlas = this.atlasInfo.atlas[layer.id];
        atlas.offsetScale = textures.pitch;
        this.texturesInfo.color.textures[index] = textures.texture;

        const canvas = this.uniforms.colorTexture.value.image;

        // compute offset / scale
        const xRatio = layer.imageSize.w / canvas.width;
        const yRatio = layer.imageSize.h / canvas.height;

        if (nope) {
            this.texturesInfo.color.offsetScale[index] = new THREE.Vector4(
                atlas.x / canvas.width + textures.pitch.x * xRatio,
                (atlas.y + atlas.offset) / canvas.height + textures.pitch.y * yRatio,
                textures.pitch.z * xRatio,
                textures.pitch.w * yRatio);
            // we already got our texture (needsUpdate is done in TiledNodeProcessing)
            return Promise.resolve();
        }

        if (textures.texture.image == this.canvas) {
            this.pendingUpdates.push(() => {
                this.texturesInfo.color.offsetScale[index] = new THREE.Vector4(
                    atlas.x / this.canvas.width + textures.pitch.x * xRatio,
                    (atlas.y + atlas.offset) / this.canvas.height + textures.pitch.y * yRatio,
                    textures.pitch.z * xRatio,
                    textures.pitch.w * yRatio);
            });

            if (this.setTimeoutId != null) {
                clearTimeout(this.setTimeoutId);
            }
            this.setTimeoutId = setTimeout(() => {
                this.texturesInfo.color.parentAtlasTexture = null;
                this.uniforms.colorTexture.value = this.texturesInfo.color.atlasTexture;

                for (const up of this.pendingUpdates) {
                    up();
                }
                this.pendingUpdates.length = 0;
                this.texturesInfo.color.atlasTexture.needsUpdate = true;
                if (this.visible) {
                    view.notifyChange();
                }
                this.setTimeoutId = null;
            }, 300 + Math.random() * 300);
            // already drawn on the canvas
            return Promise.resolve();
        }

        return Promise.resolve(true).then(() => {
            // draw the full image
            this.texturesInfo.color.offsetScale[index] = new THREE.Vector4(
            atlas.x / this.canvas.width + textures.pitch.x * xRatio,
            (atlas.y + atlas.offset) / this.canvas.height + textures.pitch.y * yRatio,
            textures.pitch.z * xRatio,
            textures.pitch.w * yRatio);

            this.canvasRevision = drawLayerOnCanvas(
                layer,
                this.texturesInfo.color.atlasTexture,
                atlas,
                textures.texture.image,
                this.texturesInfo.color.offsetScale[index],
                this.canvasRevision);
        });
    } else {
        throw new Error(`Unsupported layer type '${layer.type}'`);
    }
};

function rebuildFragmentShader(shader) {
    const material = this;
    const _atlas = material.atlasInfo.atlas;
    let textureReadingCode = '';
    const w = material.atlasInfo.maxX;
    const h = material.atlasInfo.maxY;
    for (let i = 0; i < material.colorLayers.length; i++) {
        const layer = material.colorLayers[i];
        const atlas = _atlas[layer.id];
        const validArea = {
            x1: atlas.x / w,
            x2: atlas.x / w + layer.imageSize.w / w,
            y2: 1 - (atlas.y + atlas.offset) / h,
            y1: 1 - ((atlas.y + atlas.offset) / h + layer.imageSize.h / h),
        };

        // Use premultiplied-alpha blending formula because source textures are either:
        //     - fully opaque (layer.transparent = false)
        //     - or use premultiplied alpha (texture.premultiplyAlpha = true)
        // Note: using material.premultipliedAlpha doesn't make sense since we're manually blending
        // the multiple colors in the shader.
        if (material.colorLayers[i].discardOutsideUV) {
            const epsilon = 0.001;
            textureReadingCode += `
            if (colorVisible[${i}] && colorOpacity[${i}] > 0.0) {
                vec2 uv = computeUv(vUv, colorOffsetScale[${i}].xy, colorOffsetScale[${i}].zw);
                if (uv.x < ${validArea.x1 - epsilon} ||
                    uv.x > ${validArea.x2 + epsilon} ||
                    uv.y > ${validArea.y2 + epsilon} ||
                    uv.y < ${validArea.y1 - epsilon}) {

                } else {
                    vec4 layerColor = texture2D(colorTexture, uv);
                    diffuseColor = diffuseColor * (1.0 - layerColor.a * colorOpacity[${i}]) + layerColor * colorOpacity[${i}];
                }
            }
            `;
        } else {
            textureReadingCode += `
            if (colorVisible[${i}] && colorOpacity[${i}] > 0.0) {
                vec2 uv = clamp(
                    computeUv(vUv, colorOffsetScale[${i}].xy, colorOffsetScale[${i}].zw),
                    vec2(${validArea.x1}, ${validArea.y1}), vec2(${validArea.x2}, ${validArea.y2}));
                vec4 layerColor = texture2D(colorTexture, uv);
                diffuseColor = diffuseColor * (1.0 - layerColor.a * colorOpacity[${i}]) + layerColor * colorOpacity[${i}];
            }
            `;
        }
    }
    material.fragmentShader = TileFS.replace(
        'INSERT_TEXTURE_READING_CODE',
        textureReadingCode);
    shader.fragmentShader = material.fragmentShader;

    material.onBeforeCompile = function () {};
    return material.fragmentShader;
}

LayeredMaterial.prototype.pushLayer = function pushLayer(newLayer) {
    this.texturesInfo.color.opacity.push(newLayer.opacity);
    this.texturesInfo.color.visible.push(newLayer.visible);
    this.texturesInfo.color.offsetScale.push(new THREE.Vector4());
    this.texturesInfo.color.textures.push(emptyTexture);
    this.colorLayers.push(newLayer);

    if (this.colorLayers.length == 1) {
        // init uniforms
        this.uniforms.colorOffsetScale = new THREE.Uniform(this.texturesInfo.color.offsetScale);
        this.uniforms.colorOpacity = new THREE.Uniform(this.texturesInfo.color.opacity);
        this.uniforms.colorVisible = new THREE.Uniform(this.texturesInfo.color.visible);
    }
    this.defines.TEX_UNITS = this.colorLayers.length;
    this.needsUpdate = true;

    this.onBeforeCompile = rebuildFragmentShader.bind(this);
};

LayeredMaterial.prototype.update = function update() {
    if (this.atlasInfo.maxX > this.canvas.width || this.atlasInfo.maxY > this.canvas.height) {
        // TODO: test this and then make providers draw directly in this.canvas
        const newCanvas = document.createElement('canvas');
        newCanvas.width = this.atlasInfo.maxX;
        newCanvas.height = this.atlasInfo.maxY;
        if (this.canvas.width > 0) {
            const ctx = newCanvas.getContext('2d');
            ctx.drawImage(this.canvas, 0, 0);
        }
        this.texturesInfo.color.atlasTexture.dispose();
        this.texturesInfo.color.atlasTexture = new THREE.CanvasTexture(newCanvas);
        this.canvas = newCanvas;
    }
        // this clears the canvas

        // so we need to redraw all the known layers
    //     for (let i = 0; i < this.colorLayers.length; i++) {
    //         if (this.texturesInfo.color.textures[i] == emptyTexture) {
    //             continue;
    //         }
    //         const layer = this.colorLayers[i];
    //         // reconstruct offsetScale
    //         const xRatio = layer.imageSize.w / maxX;
    //         const yRatio = layer.imageSize.h / maxY;
    //         const offsetScale = oldAtlas[this.colorLayers[i].id].offsetScale;
    //         atlas[layer.id].offsetScale = offsetScale;

    //         this.texturesInfo.color.offsetScale[i].set(
    //             atlas[layer.id].x / maxX +
    //                 offsetScale.x * xRatio,
    //             atlas[layer.id].y / maxY +
    //                 offsetScale.y * yRatio,
    //             offsetScale.z * xRatio,
    //             offsetScale.w * yRatio);
    //         // redraw texture
    //         this.canvasRevision = drawLayerOnCanvas(
    //             layer,
    //             this.texturesInfo.color.atlasTexture,
    //             atlas[layer.id],
    //             this.texturesInfo.color.textures[i].image,
    //             this.texturesInfo.color.offsetScale[i],
    //             this.canvasRevision);
    //     }
    // }
};

LayeredMaterial.prototype.indexOfColorLayer = function indexOfColorLayer(layer) {
    return this.colorLayers.indexOf(layer);
};

LayeredMaterial.prototype.setLayerOpacity = function setLayerOpacity(layer, opacity) {
    const index = Number.isInteger(layer) ? layer : this.indexOfColorLayer(layer);
    this.texturesInfo.color.opacity[index] = opacity;
};

LayeredMaterial.prototype.setLayerVisibility = function setLayerVisibility(layer, visible) {
    const index = Number.isInteger(layer) ? layer : this.indexOfColorLayer(layer);
    this.texturesInfo.color.visible[index] = visible;
};

LayeredMaterial.prototype.isLayerTextureLoaded = function isColorLayerLoaded(layer) {
    if (layer.type == 'color') {
        const index = this.indexOfColorLayer(layer);
        if (index >= 0) {
            return this.texturesInfo.color.textures[index] != emptyTexture;
        }
    } else if (layer.type == 'elevation') {
        return this.texturesInfo.elevation.texture != emptyTexture;
    }
};

LayeredMaterial.prototype.setUuid = function setUuid(uuid) {
    this.uniforms.uuid.value = uuid;
};

export function initDebugTool(view) {
    // Should move to a proper debug tool.. later
    const div = document.createElement('div');
    div.style.top = '0';
    div.style.right = '0';
    div.style.position = 'absolute';
    div.style.backgroundColor = 'lightgray';
    document.getElementById('viewerDiv').appendChild(div);

    document.addEventListener('click', (evt) => {
      const r = view.tileLayer.pickObjectsAt(view, view.eventToViewCoords(evt), 1);
      if (!r.length) return;
      const obj = r[0].object;

      while (div.firstChild) {
          div.removeChild(div.firstChild);
      }
      if (obj.material.canvas) {
        div.appendChild(obj.material.uniforms.colorTexture.value.image);
      }
    });
}

export default LayeredMaterial;
