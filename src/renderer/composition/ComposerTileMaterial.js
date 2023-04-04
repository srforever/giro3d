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
import InterpretationChunk from '../shader/chunk/Interpretation.glsl';
import FillNoDataChunk from '../shader/chunk/FillNoData.glsl';
import Interpretation, { Mode } from '../../core/layer/Interpretation.js';

ShaderChunk.Interpretation = InterpretationChunk;
ShaderChunk.FillNoData = FillNoDataChunk;

const POOL = [];

class ComposerTileMaterial extends RawShaderMaterial {
    /**
     * Creates an instance of ComposerTileMaterial.
     *
     * @param {object} [options={}] The options.
     * @param {Interpretation} options.interpretation The image interpretation.
     * @param {Texture} options.texture The texture.
     * @param {boolean} options.flipY If true, the image will be flipped vertically in the shader.
     * @param {boolean} options.fillNoData If true, applies an algorithm to interpolate
     * no-data pixels from neighbouring valid pixels.
     */
    constructor(options = undefined) {
        super();

        this.fragmentShader = FragmentShader;
        this.vertexShader = VertexShader;

        this.uniforms.texture = new Uniform(null);
        this.uniforms.interpretation = new Uniform(null);
        this.uniforms.flipY = new Uniform(false);
        this.uniforms.fillNoData = new Uniform(false);
        this.uniforms.textureSize = new Uniform(new Vector2(0, 0));
        this.uniforms.showImageOutlines = new Uniform(false);

        if (options) {
            this.update(options);
        }
    }

    /**
     * Updates the material.
     *
     * @param {object} opts The options.
     * @param {Texture} opts.texture The texture.
     * @param {Interpretation} opts.interpretation The image interpretation.
     * @param {boolean} opts.flipY If true, the image will be flipped vertically in the shader.
     * @param {boolean} opts.fillNoData If true, applies an algorithm to interpolate
     * no-data pixels from neighbouring valid pixels.
     * @param {boolean} opts.showImageOutlines Displays the outline of the tile.
     */
    update({
        texture,
        interpretation,
        flipY,
        fillNoData,
        showImageOutlines,
    }) {
        const interp = interpretation ?? Interpretation.Raw;

        this.texture = texture;
        this.dataType = interp.mode !== Mode.Raw ? FloatType : this.texture.type;
        this.pixelFormat = this.texture.format;

        const interpValue = {};
        interp.setUniform(interpValue);
        if (texture) {
            interp.prepareTexture(texture);
        }

        this.uniforms.interpretation.value = interpValue;
        this.uniforms.texture.value = texture;
        this.uniforms.flipY.value = flipY ?? false;
        this.uniforms.fillNoData.value = fillNoData ?? false;
        this.uniforms.showImageOutlines.value = showImageOutlines ?? false;

        if (this.texture?.image) {
            const image = this.texture.image;
            this.uniforms.textureSize.value.set(image.width, image.height);
        }
    }

    reset() {
        this.texture = null;
    }

    /**
     * Acquires a pooled material.
     *
     * @param {object} opts The options.
     * @param {Texture} opts.texture The texture.
     * @param {Interpretation} opts.interpretation The image interpretation.
     * @param {boolean} opts.flipY If true, the image will be flipped vertically in the shader.
     * @param {boolean} opts.fillNoData If true, applies an algorithm to interpolate
     * no-data pixels from neighbouring valid pixels.
     * @param {boolean} opts.showImageOutlines Displays the outline of the tile.
     */
    static acquire(opts) {
        if (POOL.length > 0) {
            const mat = POOL.pop();
            mat.update(opts);
        }
        return new ComposerTileMaterial(opts);
    }

    /**
     * Releases the material back into the pool.
     *
     * @param {ComposerTileMaterial} material The material.
     */
    static release(material) {
        material.reset();
        POOL.push(material);
    }
}

export default ComposerTileMaterial;
