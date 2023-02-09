/**
 * @module renderer/PointsMaterial
 */

import {
    Matrix4,
    Color,
    Vector2,
    Vector3,
    Vector4,
    Uniform,
    NoBlending,
    NormalBlending,
    RawShaderMaterial,
} from 'three';
import PointsVS from './shader/PointsVS.glsl';
import PointsFS from './shader/PointsFS.glsl';
import Capabilities from '../core/system/Capabilities.js';

/**
 * Specifies the way points are colored.
 *
 * @api
 * @readonly
 * @enum {number}
 */
export const MODE = {
    /** The points are colored using their own color */
    COLOR: 0,
    /** The points are colored using their intensity */
    INTENSITY: 1,
    /** The points are colored using their classification */
    CLASSIFICATION: 2,
    /** The points are colored using their normal */
    NORMAL: 3,
    /** The points are colored using an external texture, such as a color layer */
    TEXTURE: 4,
    /** The points are colored using their elevation */
    ELEVATION: 5,
};

const NUM_TRANSFO = 16;

class PointsMaterial extends RawShaderMaterial {
    /**
     * Creates a PointsMaterial using the specified options.
     *
     * @param {object} options The options.
     * @param {number} [options.size=0] The point size.
     * @param {number} [options.scale] The point scale.
     * @param {Vector4} [options.overlayColor=new Vector4(0, 0, 0, 0)] An additional color to use.
     * @param {number} [options.mode=MODE.COLOR] Specifies the criterion to colorize points.
     */
    constructor(options = {}) {
        super();
        if (__DEBUG__) {
            this.defines.DEBUG = 1;
        }
        this.vertexShader = PointsVS;
        this.fragmentShader = PointsFS;

        this.size = options.size || 0;
        this.scale = options.scale || (0.05 * 0.5) / Math.tan(1.0 / 2.0); // autosizing scale
        this.overlayColor = options.overlayColor || new Vector4(0, 0, 0, 0);
        this.mode = options.mode || MODE.COLOR;
        this.pickingId = 0;

        for (const key of Object.keys(MODE)) {
            if (Object.prototype.hasOwnProperty.call(MODE, key)) {
                this.defines[`MODE_${key}`] = MODE[key];
            }
        }

        this.uniforms.size = new Uniform(this.size);
        this.uniforms.mode = new Uniform(this.mode);
        this.uniforms.pickingId = new Uniform(this.pickingId);
        this.uniforms.opacity = new Uniform(this.opacity);
        this.uniforms.overlayColor = new Uniform(this.overlayColor);

        if (Capabilities.isLogDepthBufferSupported()) {
            this.defines.USE_LOGDEPTHBUF = 1;
            this.defines.USE_LOGDEPTHBUF_EXT = 1;
        }
        this.extensions.fragDepth = true;
        this.uniforms.enableTransfo = new Uniform(0);

        this.transformations = [];
        for (let i = 0; i < NUM_TRANSFO; i++) {
            this.transformations.push(new Matrix4());
        }
        this.uniforms.transformations = new Uniform(this.transformations);

        this.vec = [];
        for (let i = 0; i < NUM_TRANSFO; i++) {
            this.vec.push(new Vector3());
        }
        this.uniforms.vec = new Uniform(this.vec);

        this.origin = [];
        for (let i = 0; i < NUM_TRANSFO; i++) {
            this.origin.push(new Vector2());
        }
        this.uniforms.origin = new Uniform(this.origin);

        this.influence = [];
        for (let i = 0; i < NUM_TRANSFO; i++) {
            this.influence.push(new Vector2());
        }
        this.uniforms.influence = new Uniform(this.influence);

        this.tColors = [];
        for (let i = 0; i < NUM_TRANSFO; i++) {
            this.tColors.push(new Color());
        }
        this.colorLayer = null;
        this.uniforms.tColors = new Uniform(this.tColors);

        this.updateUniforms();
    }

    dispose() {
        if (this.disposed) {
            return;
        }
        this.dispatchEvent({
            type: 'dispose',
        });
        this.disposed = true;

        const texture = this.getColorTexture(this.colorLayer);
        if (texture?.owner === this) {
            texture.dispose();
        }
    }

    clone() {
        const cl = super.clone(this);
        cl.update(this);
        return cl;
    }

    enablePicking(picking) {
        this.pickingId = picking;
        this.blending = picking ? NoBlending : NormalBlending;
        this.updateUniforms();
    }

    updateUniforms() {
        // if size is null, switch to autosizing using the canvas height
        this.uniforms.size.value = (this.size > 0) ? this.size : -this.scale * window.innerHeight;
        this.uniforms.mode.value = this.mode;
        this.uniforms.pickingId.value = this.pickingId;
        this.uniforms.opacity.value = this.opacity;
        this.uniforms.overlayColor.value = this.overlayColor;
    }

    update(source) {
        if (source) {
            this.visible = source.visible;
            this.opacity = source.opacity;
            this.transparent = source.transparent;
            this.needsUpdate = true;
            this.size = source.size;
            this.mode = source.mode;
            this.pickingId = source.pickingId;
            this.scale = source.scale;
            this.overlayColor.copy(source.overlayColor);
        }
        this.updateUniforms();
        if (source) {
            Object.assign(this.defines, source.defines);
        }
        return this;
    }

    // Coloring support
    pushLayer(layer, extent) {
        this.mode = MODE.TEXTURE;
        this.updateUniforms();

        this.colorLayer = layer;
        this.uniforms.overlayTexture = new Uniform();
        this.uniforms.hasOverlayTexture = new Uniform(0);
        this.uniforms.offsetScale = new Uniform(new Vector4(0, 0, 1, 1));
        this.uniforms.extentBottomLeft = new Uniform(new Vector2(extent.west(), extent.south()));
        const dim = extent.dimensions();
        this.uniforms.extentSize = new Uniform(new Vector2(dim.x, dim.y));
    }

    getColorTexture(layer) {
        if (layer !== this.colorLayer) {
            return null;
        }
        return this.uniforms.overlayTexture?.value;
    }

    setColorTextures(layer, textures, shortcut, instance, isInherited = false) {
        if (Array.isArray(textures)) {
            textures = textures[0];
        }
        if (layer === this.colorLayer) {
            const texture = textures.texture;
            if (!isInherited) {
                texture.owner = this;
            }
            this.uniforms.overlayTexture.value = textures.texture;
            this.uniforms.hasOverlayTexture.value = 1;
            this.uniforms.offsetScale.value.copy(textures.pitch);
        }
        return Promise.resolve();
    }

    // eslint-disable-next-line class-methods-use-this
    setSequence() {
        // no-op
    }

    // eslint-disable-next-line class-methods-use-this
    setLayerVisibility() {
        // no-op
    }

    // eslint-disable-next-line class-methods-use-this
    setLayerOpacity() {
        // no-op
    }

    enableTransfo(v) {
        if (v) {
            this.defines.DEFORMATION_SUPPORT = 1;
            this.defines.NUM_TRANSFO = NUM_TRANSFO;
        } else {
            delete this.defines.DEFORMATION_SUPPORT;
            delete this.defines.NUM_TRANSFO;
        }
        this.needsUpdate = true;
    }
}

export default PointsMaterial;
