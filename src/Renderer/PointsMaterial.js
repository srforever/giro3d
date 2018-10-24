import { Vector2, Vector4, Uniform, NoBlending, NormalBlending, RawShaderMaterial } from 'three';
import PointsVS from './Shader/PointsVS.glsl';
import PointsFS from './Shader/PointsFS.glsl';
import Capabilities from '../Core/System/Capabilities';

export const MODE = {
    COLOR: 0,
    INTENSITY: 1,
    CLASSIFICATION: 2,
    NORMAL: 3,
    TEXTURE: 4,
};

class PointsMaterial extends RawShaderMaterial {
    constructor(options = {}) {
        super();
        this.vertexShader = PointsVS;
        this.fragmentShader = PointsFS;

        this.size = options.size || 0;
        this.scale = options.scale || 0.05 * 0.5 / Math.tan(1.0 / 2.0); // autosizing scale
        this.overlayColor = options.overlayColor || new Vector4(0, 0, 0, 0);
        this.mode = options.mode || MODE.COLOR;
        this.pickingId = 0;

        for (const key in MODE) {
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

        if (__DEBUG__) {
            this.defines.DEBUG = 1;
        }
        this.colorLayer = null;

        this.updateUniforms();
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
    pushLayer(layer, extents) {
        this.mode = MODE.TEXTURE;
        this.updateUniforms();

        this.colorLayer = layer;
        this.uniforms.texture = new Uniform();
        this.uniforms.offsetScale = new Uniform(new Vector4(0, 0, 1, 1));
        this.uniforms.extentTopLeft = new Uniform(new Vector2(extents[0].west(), extents[0].north()));
        const dim = extents[0].dimensions();
        this.uniforms.extentSize = new Uniform(new Vector2(dim.x, dim.y));
    }

    getLayerTextures(layer) {
        if (layer === this.colorLayer) {
            return { textures: [this.uniforms.texture.value] };
        }
    }
    setLayerTextures(layer, textures) {
        if (Array.isArray(textures)) {
            textures = textures[0];
        }
        if (layer === this.colorLayer) {
            this.uniforms.texture.value = textures.texture;
            this.uniforms.offsetScale.value.copy(textures.pitch);
        }
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
}

export default PointsMaterial;
