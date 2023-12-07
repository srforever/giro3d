import {
    Uniform,
    type Texture,
    FloatType,
    CanvasTexture,
    type TextureDataType,
    type AnyPixelFormat,
    GLSL3,
    ShaderMaterial,
} from 'three';

import FragmentShader from './ComposerTileFS.glsl';
import VertexShader from './ComposerTileVS.glsl';
import Interpretation, { Mode } from '../../core/layer/Interpretation';
import TextureGenerator from '../../utils/TextureGenerator';
// Matches the NoDataOptions struct in the shader
interface NoDataOptions {
    replacementAlpha: number;
    radius: number;
    enabled: boolean;
}

export interface Options {
    texture: Texture;
    interpretation: Interpretation;
    flipY: boolean;
    noDataOptions: NoDataOptions;
    showImageOutlines: boolean;
    transparent: boolean;
    expandRGB: boolean;
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

const POOL: ShaderMaterial[] = [];
const POOL_SIZE = 2048;
let GRID_TEXTURE: Texture;

class ComposerTileMaterial extends ShaderMaterial {
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
        super({ glslVersion: GLSL3 });

        this.fragmentShader = FragmentShader;
        this.vertexShader = VertexShader;

        this.uniforms.tex = new Uniform(null);
        this.uniforms.gridTexture = new Uniform(null);
        this.uniforms.interpretation = new Uniform(null);
        this.uniforms.flipY = new Uniform(false);
        this.uniforms.noDataOptions = new Uniform({ enabled: false });
        this.uniforms.showImageOutlines = new Uniform(false);
        this.uniforms.opacity = new Uniform(this.opacity);
        this.uniforms.channelCount = new Uniform(3);
        this.uniforms.expandRGB = new Uniform(options.expandRGB ?? false);
        this.now = performance.now();
        this.type = 'ComposerTileMaterial';

        if (options) {
            this.init(options);
        }
    }

    private init(options: Options) {
        const interp = options.interpretation ?? Interpretation.Raw;

        this.dataType = interp.mode !== Mode.Raw ? FloatType : options.texture.type;
        this.pixelFormat = options.texture.format;

        const interpValue = {};
        interp.setUniform(interpValue);
        interp.prepareTexture(options.texture);

        // The no-data filling algorithm does not like transparent images
        this.needsUpdate = this.transparent !== options.transparent;
        this.transparent = options.transparent ?? false;
        this.opacity = 1;
        this.uniforms.opacity.value = this.opacity;
        this.uniforms.interpretation.value = interpValue;
        this.uniforms.tex.value = options.texture;
        this.uniforms.flipY.value = options.flipY ?? false;
        this.uniforms.noDataOptions.value = options.noDataOptions ?? { enabled: false };
        this.uniforms.showImageOutlines.value = options.showImageOutlines ?? false;
        this.uniforms.expandRGB.value = options.expandRGB ?? false;

        const channelCount = TextureGenerator.getChannelCount(this.pixelFormat);
        this.uniforms.channelCount.value = channelCount;
        if (options.showImageOutlines) {
            if (!GRID_TEXTURE) {
                GRID_TEXTURE = createGridTexture();
            }
            this.uniforms.gridTexture.value = GRID_TEXTURE;
        }
    }

    private reset() {
        this.uniforms.tex.value = null;
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
