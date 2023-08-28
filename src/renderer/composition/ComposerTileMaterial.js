import {
    Uniform,
    RawShaderMaterial,
    Texture,
    FloatType,
    MathUtils,
    CanvasTexture,
} from 'three';

import FragmentShader from './ComposerTileFS.glsl';
import VertexShader from './ComposerTileVS.glsl';
import Interpretation, { Mode } from '../../core/layer/Interpretation';

function createGridTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const w = canvas.width;
    const h = canvas.height;

    const ctx = canvas.getContext('2d');

    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, w, h);

    ctx.strokeStyle = 'yellow';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 4;
    const subdivs = 4;
    const xWidth = w / subdivs;

    for (let i = 1; i < subdivs; i++) {
        const x = i * xWidth;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }

    const yWidth = h / subdivs;
    for (let i = 1; i < subdivs; i++) {
        const y = i * yWidth;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // Center of the image
    ctx.beginPath();
    ctx.fillStyle = 'yellow';
    ctx.arc(w / 2, h / 2, 8, 0, 2 * Math.PI);
    ctx.fill();

    return new CanvasTexture(canvas);
}

const POOL = [];
const POOL_SIZE = 2048;
let GRID_TEXTURE;

class ComposerTileMaterial extends RawShaderMaterial {
    /**
     * Creates an instance of ComposerTileMaterial.
     *
     * @param {object} [options={}] The options.
     * @param {Interpretation} options.interpretation The image interpretation.
     * @param {number} options.fadeDuration The fade duration.
     * @param {Texture} options.texture The texture.
     * @param {boolean} options.transparent Enable transparency.
     * @param {boolean} options.flipY If true, the image will be flipped vertically in the shader.
     * @param {boolean} options.fillNoData If true, applies an algorithm to interpolate
     * no-data pixels from neighbouring valid pixels.
     */
    constructor(options = undefined) {
        super();

        this.fragmentShader = FragmentShader;
        this.vertexShader = VertexShader;

        this.uniforms.texture = new Uniform(null);
        this.uniforms.gridTexture = new Uniform(null);
        this.uniforms.interpretation = new Uniform(null);
        this.uniforms.flipY = new Uniform(false);
        this.uniforms.fillNoData = new Uniform(false);
        this.uniforms.showImageOutlines = new Uniform(false);
        this.uniforms.opacity = new Uniform(this.opacity);
        this.now = performance.now();
        this._opacity = 1;
        this._ready = true;

        if (options) {
            this.init(options);
        }
    }

    set opacity(v) {
        if (v !== this._opacity) {
            this._opacity = v;
            this.now = performance.now();
        }
        if (!this.fadeDuration && this._ready) {
            this.uniforms.opacity.value = v;
        }
    }

    get opacity() {
        return this._opacity;
    }

    isAnimating() {
        return this.opacity !== this.uniforms.opacity.value;
    }

    update(now) {
        const uniform = this.uniforms.opacity;

        if (this.opacity !== uniform.value) {
            if (!this.fadeDuration) {
                uniform.value = this.opacity;
                this.now = now;
                return false;
            }

            // Process opacity animation
            const dt = (now - this.now) / this.fadeDuration;
            const sign = Math.sign(this.opacity - uniform.value);

            const newValue = MathUtils.clamp(uniform.value + dt * sign, 0, 1);
            uniform.value = newValue;
            this.now = now;

            return true;
        }

        this.now = now;
        return false;
    }

    /**
     * Initializes an existing material with new values.
     *
     * @param {object} opts The options.
     * @param {Texture} opts.texture The texture.
     * @param {Interpretation} opts.interpretation The image interpretation.
     * @param {boolean} opts.flipY If true, the image will be flipped vertically in the shader.
     * @param {boolean} opts.fillNoData If true, applies an algorithm to interpolate
     * no-data pixels from neighbouring valid pixels.
     * @param {boolean} opts.showImageOutlines Displays the outline of the tile.
     * @param {number} opts.fadeDuration The fade duration.
     * @param {boolean} opts.transparent Enable transparency.
     */
    init({
        texture,
        interpretation,
        flipY,
        fillNoData = false,
        showImageOutlines,
        fadeDuration,
        transparent,
    }) {
        const interp = interpretation ?? Interpretation.Raw;

        this.dataType = interp.mode !== Mode.Raw ? FloatType : texture.type;
        this.pixelFormat = texture.format;

        const interpValue = {};
        interp.setUniform(interpValue);
        if (texture) {
            interp.prepareTexture(texture);
        }

        // The no-data filling algorithm does not like transparent images
        this.needsUpdate = this.transparent !== transparent;
        this.transparent = transparent ?? false;
        this.now = performance.now();
        this.fadeDuration = fadeDuration;
        if (this.fadeDuration > 0) {
            this.opacity = 0;
        } else {
            this.opacity = 1;
        }
        this.uniforms.opacity.value = this.opacity;
        this.uniforms.interpretation.value = interpValue;
        this.uniforms.texture.value = texture;
        this.uniforms.flipY.value = flipY ?? false;
        this.uniforms.fillNoData.value = fillNoData ?? false;
        this.uniforms.showImageOutlines.value = showImageOutlines ?? false;
        if (showImageOutlines) {
            if (!GRID_TEXTURE) {
                GRID_TEXTURE = createGridTexture();
            }
            this.uniforms.gridTexture.value = GRID_TEXTURE;
        }
    }

    reset() {
        this.uniforms.texture.value = null;
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
            mat.init(opts);
            return mat;
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
        if (POOL.length < POOL_SIZE) {
            POOL.push(material);
        } else {
            material.dispose();
        }
    }
}

export default ComposerTileMaterial;
