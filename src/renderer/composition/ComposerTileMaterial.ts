import {
    Uniform,
    RawShaderMaterial,
    type Texture,
    FloatType,
    CanvasTexture,
    type TextureDataType,
    type AnyPixelFormat,
} from 'three';

import FragmentShader from './ComposerTileFS.glsl';
import VertexShader from './ComposerTileVS.glsl';
import Interpretation, { Mode } from '../../core/layer/Interpretation';

export interface Options {
    texture: Texture;
    interpretation: Interpretation;
    flipY: boolean;
    fillNoData: boolean;
    showImageOutlines: boolean;
    transparent: boolean;
}

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

const POOL: RawShaderMaterial[] = [];
const POOL_SIZE = 2048;
let GRID_TEXTURE: Texture;

class ComposerTileMaterial extends RawShaderMaterial {
    now: number;
    dataType: TextureDataType;
    pixelFormat: AnyPixelFormat;
    readonly isComposerTileMaterial = true;

    /**
     * Creates an instance of ComposerTileMaterial.
     *
     * @param options The options
     */
    constructor(options?: Options) {
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
        this.type = 'ComposerTileMaterial';

        if (options) {
            this.init(options);
        }
    }

    /**
     * Initializes an existing material with new values.
     *
     * @param opts The options.
     * @param opts.texture The texture.
     * @param opts.interpretation The image interpretation.
     * @param opts.flipY If true, the image will be flipped vertically in the shader.
     * @param opts.fillNoData If true, applies an algorithm to interpolate
     * no-data pixels from neighbouring valid pixels.
     * @param opts.showImageOutlines Displays the outline of the tile.
     * @param opts.fadeDuration The fade duration.
     * @param opts.transparent Enable transparency.
     */
    private init({
        texture,
        interpretation,
        flipY,
        fillNoData = false,
        showImageOutlines,
        transparent,
    }: { texture: Texture;
        interpretation: Interpretation;
        flipY: boolean;
        fillNoData: boolean;
        showImageOutlines: boolean;
        fadeDuration?: number;
        transparent: boolean;
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
        this.opacity = 1;
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

    private reset() {
        this.uniforms.texture.value = null;
    }

    /**
     * Acquires a pooled material.
     *
     * @param opts The options.
     */
    static acquire(opts: Options) {
        if (POOL.length > 0) {
            const mat = POOL.pop() as ComposerTileMaterial;
            mat.init(opts);
            return mat;
        }
        return new ComposerTileMaterial(opts);
    }

    /**
     * Releases the material back into the pool.
     *
     * @param material The material.
     */
    static release(material: ComposerTileMaterial) {
        material.reset();
        if (POOL.length < POOL_SIZE) {
            POOL.push(material);
        } else {
            material.dispose();
        }
    }
}

export default ComposerTileMaterial;
