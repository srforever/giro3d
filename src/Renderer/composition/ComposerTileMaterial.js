import {
    Vector2,
    Uniform,
    RawShaderMaterial,
    ShaderChunk,
} from 'three';

import FragmentShader from './ComposerTileFS.glsl';
import VertexShader from './ComposerTileVS.glsl';
import ComputeUV from '../Shader/Chunk/ComputeUV.glsl';

ShaderChunk.ComputeUV = ComputeUV;

class ComposerTileMaterial extends RawShaderMaterial {
    constructor(texture, options = {}) {
        super();

        this.fragmentShader = FragmentShader;
        this.vertexShader = VertexShader;
        this.uniforms.texture = new Uniform(texture);

        if (options.showImageOutlines) {
            this.defines.OUTLINES = 1;
            const image = texture.image;
            this.uniforms.textureSize = new Uniform(new Vector2(image.width, image.height));
            this.needsUpdate = true;
        }
    }
}

export default ComposerTileMaterial;
