/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */


import * as THREE from 'three';
import TileVS from './Shader/TileVS.glsl';
import TileFS from './Shader/TileFS.glsl';
import Capabilities from '../Core/System/Capabilities';
import PrecisionQualifier from './Shader/Chunk/PrecisionQualifier.glsl';
import GetElevation from './Shader/Chunk/GetElevation.glsl';
import ComputeUV from './Shader/Chunk/ComputeUV.glsl';

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
const LayeredMaterial = function LayeredMaterial(options, segments) {
    THREE.RawShaderMaterial.call(this);

    const maxTexturesUnits = Capabilities.getMaxTextureUnitsCount();
    const nbSamplers = Math.min(maxTexturesUnits - 1, 16 - 2);

    options = options || { };

    // Move this to the setTerrain code
    if (options.useColorTextureElevation) {
        this.defines.COLOR_TEXTURE_ELEVATION = 1;
        // this.defines.HILLSHADE = 1;
        this.defines.STITCHING = 1;
        this.uniforms.segments = new THREE.Uniform(segments);
    } else {
        // default
        this.defines.DATA_TEXTURE_ELEVATION = 1;
    }
    if (options.side) {
        this.side = options.side;
    }

    this.defines.TEX_UNITS = nbSamplers;
        this.defines.DEBUG = 1;
    if (__DEBUG__) {
    }

    this.fragmentShader = TileFS;
    this.vertexShader = TileVS;

    // handle on textures uniforms
    this.textures = [];
    // handle on textures offsetScale uniforms
    this.offsetScale = [];
    // handle Loaded textures count by layer's type uniforms
    this.loadedTexturesCount = [0, 0];

    this.texturesInfo = {
        color: {
            offsetScale: Array(nbSamplers),
            textures: Array(nbSamplers),
            opacity: Array(nbSamplers),
            visible: Array(nbSamplers),
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
    fillArray(this.texturesInfo.color.offsetScale, vector4);
    fillArray(this.texturesInfo.color.textures, emptyTexture);
    fillArray(this.texturesInfo.color.opacity, 1.0);
    fillArray(this.texturesInfo.color.visible, false);
    fillArray(this.texturesInfo.elevation.neighbours.texture, emptyTexture);
    fillArray(this.texturesInfo.elevation.neighbours.offsetScale, vector4);

    this.layerTexturesCount = Array(8);

    fillArray(this.layerTexturesCount, 0);

    this.uniforms.validityExtent = new THREE.Uniform(new THREE.Vector4());
    this.uniforms.tileDimensions = new THREE.Uniform(new THREE.Vector2());
    this.uniforms.neighbourdiffLevel = new THREE.Uniform(new THREE.Vector4());

    // Elevation texture
    this.uniforms.elevationTexture = new THREE.Uniform(this.texturesInfo.elevation.texture);
    this.uniforms.elevationOffsetScale = new THREE.Uniform(this.texturesInfo.elevation.offsetScale);
    this.uniforms.nTex = new THREE.Uniform(this.texturesInfo.elevation.neighbours.texture);
    this.uniforms.nOff = new THREE.Uniform(this.texturesInfo.elevation.neighbours.offsetScale);

    // Color textures's layer
    this.uniforms.colorTexture = new THREE.Uniform(this.texturesInfo.color.textures);
    this.uniforms.colorOffsetScale = new THREE.Uniform(this.texturesInfo.color.offsetScale);
    this.uniforms.colorOpacity = new THREE.Uniform(this.texturesInfo.color.opacity);
    this.uniforms.colorVisible = new THREE.Uniform(this.texturesInfo.color.visible);

    this.uniforms.uuid = new THREE.Uniform(0);

    this.uniforms.noTextureColor = new THREE.Uniform(new THREE.Color(0.04, 0.23, 0.35));

    this.uniforms.opacity = new THREE.Uniform(1.0);

    this.colorLayersId = [];
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

    const index = this.indexOfColorLayer(layer.id);

    if (index !== -1) {
        return {
            texture: this.texturesInfo.color.textures[index],
            offsetScale: this.texturesInfo.color.offsetScale[index],
        };
    } else {
        // throw new Error(`Invalid layer "${layer}"`);
    }
};

LayeredMaterial.prototype.setLayerTextures = function setLayerTextures(layer, textures) {
    if (Array.isArray(textures)) {
        // console.warn(`Provider should return a single texture and not an Array. See layer id = ${layer.id}`);
        textures = textures[0];
    }

    if (layer.type === 'elevation') {
        this.texturesInfo.elevation.texture = textures.texture;
        this.uniforms.elevationTexture.value = textures.texture;
        this.texturesInfo.elevation.offsetScale.copy(textures.pitch);
    } else if (layer.type === 'color') {
        const index = this.indexOfColorLayer(layer.id);
        this.texturesInfo.color.textures[index] = textures.texture;
        this.texturesInfo.color.offsetScale[index] = textures.pitch;
    } else {
        throw new Error(`Unsupported layer type '${layer.type}'`);
    }
};

LayeredMaterial.prototype.pushLayer = function pushLayer(layer) {
    const index = this.colorLayersId.length;
    this.texturesInfo.color.opacity[index] = layer.opacity;
    this.texturesInfo.color.visible[index] = layer.visible;
    this.colorLayersId.push(layer.id);
};

LayeredMaterial.prototype.indexOfColorLayer = function indexOfColorLayer(layerId) {
    return this.colorLayersId.indexOf(layerId);
};

LayeredMaterial.prototype.setLayerOpacity = function setLayerOpacity(layer, opacity) {
    const index = Number.isInteger(layer) ? layer : this.indexOfColorLayer(layer.id);
    this.texturesInfo.color.opacity[index] = opacity;
};

LayeredMaterial.prototype.setLayerVisibility = function setLayerVisibility(layer, visible) {
    const index = Number.isInteger(layer) ? layer : this.indexOfColorLayer(layer.id);
    this.texturesInfo.color.visible[index] = visible;
};

LayeredMaterial.prototype.isLayerTextureLoaded = function isColorLayerLoaded(layer) {
    if (layer.type == 'color') {
        const index = this.indexOfColorLayer(layer.id);
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

export default LayeredMaterial;
