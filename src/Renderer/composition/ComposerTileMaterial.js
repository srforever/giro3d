import {
    Vector2,
    Uniform,
    RawShaderMaterial,
    ShaderChunk,
    Texture,
    FloatType,
} from 'three';

import FragmentShader from './ComposerTileFS.glsl';
import VertexShader from './ComposerTileVS.glsl';
import InterpretationChunk from '../Shader/Chunk/Interpretation.glsl';
import Interpretation, { Mode } from '../../Core/layer/Interpretation.js';

ShaderChunk.Interpretation = InterpretationChunk;

class ComposerTileMaterial extends RawShaderMaterial {
    /**
     * Creates an instance of ComposerTileMaterial.
     *
     * @param {Texture} texture The texture.
     * @param {object} [options={}] The options.
     * @param {Interpretation} options.interpretation The image interpretation.
     */
    constructor(texture, options = {}) {
        super();

        this.fragmentShader = FragmentShader;
        this.vertexShader = VertexShader;
        this.texture = texture;
        this.uniforms.texture = new Uniform(texture);

        const interpValue = {};
        const interp = options.interpretation ?? Interpretation.Raw;
        interp.setUniform(interpValue);
        this.uniforms.interpretation = new Uniform(interpValue);

        interp.prepareTexture(texture);

        this.dataType = interp.mode !== Mode.Raw ? FloatType : texture.type;
        this.pixelFormat = texture.format;

        if (options.showImageOutlines) {
            this.defines.OUTLINES = 1;
            const image = texture.image;
            this.uniforms.textureSize = new Uniform(new Vector2(image.width, image.height));
            this.needsUpdate = true;
        }
    }
}

export default ComposerTileMaterial;
