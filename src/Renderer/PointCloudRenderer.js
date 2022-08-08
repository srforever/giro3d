import {
    BufferGeometry,
    Color,
    DepthTexture,
    Float32BufferAttribute,
    LinearFilter,
    Matrix4,
    Mesh,
    NearestFilter,
    OrthographicCamera,
    RGBAFormat,
    Scene,
    ShaderMaterial,
    UnsignedShortType,
    Vector2,
    WebGLRenderTarget,
} from 'three';
import BasicVS from './Shader/BasicVS.glsl';
import EDLPassZeroFS from './Shader/PointCloud/EDLPassZeroFS.glsl';
import EDLPassOneFS from './Shader/PointCloud/EDLPassOneFS.glsl';
import EDLPassTwoFS from './Shader/PointCloud/EDLPassTwoFS.glsl';
import OcclusionFS from './Shader/PointCloud/OcclusionFS.glsl';
import InpaintingFS from './Shader/PointCloud/InpaintingFS.glsl';

import { MAIN_LOOP_EVENTS } from '../Core/MainLoop.js';

const RT = {
    FULL_RES_0: 0,
    FULL_RES_1: 1,
    EDL_VALUES: 2,
    HALF_RES: 3,
};

function PointCloudRenderer(view) {
    this.scene = new Scene();

    // create 1 big triangle covering the screen
    const geom = new BufferGeometry();
    const vertices = [0, 0, -3, 2, 0, -3, 0, 2, -3];
    const uvs = [0, 0, 2, 0, 0, 2];
    geom.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geom.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    this.mesh = new Mesh(geom, null);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    // our camera
    this.camera = new OrthographicCamera(0, 1, 1, 0, 0, 10);

    this.classic = {
        passes: [undefined],
        setup() { return { material: undefined }; },
    };

    // E(ye)D(ome)L(ighting) setup
    // References:
    //    - https://tel.archives-ouvertes.fr/tel-00438464/document
    //    - Potree (https://github.com/potree/potree/)
    this.edl = {
        passes: [
            new ShaderMaterial({
                uniforms: {
                    depthTexture: { value: null },
                },
                vertexShader: BasicVS,
                fragmentShader: EDLPassZeroFS,
                extensions: { fragDepth: true },
            }),
            // EDL 1st pass material
            // This pass is writing a single value per pixel, describing the depth
            // difference between one pixel and its neighbours.
            new ShaderMaterial({
                uniforms: {
                    depthTexture: { value: null },
                    resolution: { value: new Vector2(256, 256) },
                    cameraNear: { value: 0.01 },
                    cameraFar: { value: 100 },
                    radius: { value: 0 },
                    strength: { value: 0 },
                    directions: { value: 0 },
                    n: { value: 0 },
                    opacity: { value: 1.0 },
                },
                vertexShader: BasicVS,
                fragmentShader: EDLPassOneFS,
            }),
            // EDL 2nd pass material
            // This pass combines the EDL value computed in pass 1 with pixels
            // colors from a normal rendering to compose the final pixel color
            new ShaderMaterial({
                uniforms: {
                    depthTexture: { value: null },
                    textureColor: { value: null },
                    textureEDL: { value: null },
                    opacity: { value: 1.0 },
                },
                vertexShader: BasicVS,
                fragmentShader: EDLPassTwoFS,
                extensions: { fragDepth: true },
            })],
        // EDL tuning
        parameters: {
            enabled: true,
            // distance to neighbours pixels
            radius: 3.0,
            // edl value coefficient
            strength: 0.35,
            // directions count where neighbours are taken
            directions: 8,
            // how many neighbours per direction
            n: 1,
        },
        setup(renderer, input, passIdx) {
            const m = this.passes[passIdx];
            if (passIdx === 0) {
                // scale down depth texture
                m.uniforms.depthTexture.value = input.depthTexture;
                return { material: m, output: renderer.renderTargets[RT.HALF_RES] };
            }
            if (passIdx === 1) {
                m.uniforms.depthTexture.value = renderer.renderTargets[RT.HALF_RES].depthTexture;
                m.uniforms.resolution.value.set(input.width, input.height);
                m.uniforms.cameraNear.value = renderer.view.camera.camera3D.near;
                m.uniforms.cameraFar.value = renderer.view.camera.camera3D.far;
                m.uniforms.radius.value = this.parameters.radius;
                m.uniforms.strength.value = this.parameters.strength;
                m.uniforms.directions.value = this.parameters.directions;
                m.uniforms.n.value = this.parameters.n;
                return { material: m, output: renderer.renderTargets[RT.EDL_VALUES] };
            }
            m.uniforms.textureColor.value = input.texture;
            m.uniforms.textureEDL.value = renderer.renderTargets[RT.EDL_VALUES].texture;
            m.uniforms.depthTexture.value = input.depthTexture;

            return { material: m };
        },
    };

    // Screen-space occlusion
    // References: http://www.crs4.it/vic/data/papers/vast2011-pbr.pdf
    this.occlusion = {
        passes: [
            // EDL 1st pass material
            // This pass is writing a single value per pixel, describing the depth
            // difference between one pixel and its neighbours.
            new ShaderMaterial({
                uniforms: {
                    depthTexture: { value: null },
                    colorTexture: { value: null },
                    m43: { value: 0 },
                    m33: { value: 0 },
                    resolution: { value: new Vector2(256, 256) },
                    invPersMatrix: { value: new Matrix4() },
                    threshold: { value: 0 },
                    showRemoved: { value: false },
                    clearColor: { value: new Color() },
                    opacity: { value: 1.0 },
                },
                vertexShader: BasicVS,
                fragmentShader: OcclusionFS,
                extensions: { fragDepth: true },
            })],
        // EDL tuning
        parameters: {
            enabled: true,
            // pixel suppression threshold
            threshold: 0.9,
            // debug feature to colorize removed pixels
            showRemoved: false,
        },
        setup(renderer, input) {
            const m = this.passes[0];
            const n = renderer.view.camera.camera3D.near;
            const f = renderer.view.camera.camera3D.far;
            const m43 = -(2 * f * n) / (f - n);
            const m33 = -(f + n) / (f - n);
            const mat = new Matrix4();
            mat.copy(renderer.view.camera.camera3D.projectionMatrix).invert();

            const mU = m.uniforms;
            mU.colorTexture.value = input.texture;
            mU.depthTexture.value = input.depthTexture;
            mU.resolution.value.set(
                input.width, input.height,
            );
            mU.m43.value = m43;
            mU.m33.value = m33;
            mU.threshold.value = this.parameters.threshold;
            mU.showRemoved.value = this.parameters.showRemoved;
            mU.invPersMatrix.value.copy(renderer.view.camera.camera3D.projectionMatrix).invert();
            renderer.view.mainLoop.gfxEngine.renderer.getClearColor(mU.clearColor.value);

            return { material: m };
        },
    };

    // Screen-space filling
    // References: http://www.crs4.it/vic/data/papers/vast2011-pbr.pdf
    this.inpainting = {
        passes: [
            // EDL 1st pass material
            // This pass is writing a single value per pixel, describing the depth
            // difference between one pixel and its neighbours.
            new ShaderMaterial({
                uniforms: {
                    depthTexture: { value: null },
                    colorTexture: { value: null },
                    resolution: { value: new Vector2(256, 256) },
                    depth_contrib: { value: 0.5 },
                    opacity: { value: 1.0 },
                    m43: { value: 0 },
                    m33: { value: 0 },
                    enableZAttenuation: { value: false },
                    zAttMax: { value: 0 },
                    zAttMin: { value: 0 },
                },
                vertexShader: BasicVS,
                fragmentShader: InpaintingFS,
                extensions: { fragDepth: true },
            })],
        // EDL tuning
        parameters: {
            enabled: true,
            // how many fill step should be performed
            fill_steps: 2,
            // depth contribution to the final color (?)
            depth_contrib: 0.5,
            enableZAttenuation: true,
            zAttMin: 10,
            zAttMax: 100,
        },
        setup(renderer, input) {
            const m = this.passes[0];
            const n = renderer.view.camera.camera3D.near;
            const f = renderer.view.camera.camera3D.far;
            const m43 = -(2 * f * n) / (f - n);
            const m33 = -(f + n) / (f - n);

            m.uniforms.m43.value = m43;
            m.uniforms.m33.value = m33;

            m.uniforms.colorTexture.value = input.texture;
            m.uniforms.depthTexture.value = input.depthTexture;
            m.uniforms.resolution.value.set(input.width, input.height);
            m.uniforms.depth_contrib.value = this.parameters.depth_contrib;
            m.uniforms.enableZAttenuation.value = this.parameters.enableZAttenuation;
            m.uniforms.zAttMin.value = this.parameters.zAttMin;
            m.uniforms.zAttMax.value = this.parameters.zAttMax;

            return { material: m };
        },
    };

    this.renderTargets = _createRenderTargets(view);

    this.view = view;
    view.addFrameRequester(MAIN_LOOP_EVENTS.BEFORE_CAMERA_UPDATE, this.update.bind(this));
}

PointCloudRenderer.prototype.update = function update() {
    if (this.view.camera.width !== this.renderTargets[RT.FULL_RES_0].width
        || this.view.camera.height !== this.renderTargets[RT.FULL_RES_0].height) {
        // release old render targets
        this.renderTargets.forEach(rt => rt.dispose());
        // build new ones
        this.renderTargets = _createRenderTargets(this.view);
    }
};

PointCloudRenderer.prototype.renderView = function renderView(view, opacity = 1.0) {
    const g = view.mainLoop.gfxEngine;
    const r = g.renderer;

    const stages = [];

    stages.push(this.classic);

    if (this.occlusion.parameters.enabled) {
        stages.push(this.occlusion);
    }
    if (this.inpainting.parameters.enabled) {
        for (let i = 0; i < this.inpainting.parameters.fill_steps; i++) {
            stages.push(this.inpainting);
        }
    }
    if (this.edl.parameters.enabled) {
        stages.push(this.edl);
    }

    const oldClearAlpha = r.getClearAlpha();
    r.setClearAlpha(0.0);

    let previousStageOutput = RT.FULL_RES_0;
    for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];

        // ping-pong between FULL_RES_0 and FULL_RES_1, unless overriden by stage
        const stageOutput = (previousStageOutput + 1) % 2;
        for (let j = 0; j < stage.passes.length; j++) {
            // prepare stage
            // eslint-disable-next-line prefer-const
            let { material, output } = stage.setup(
                this, this.renderTargets[previousStageOutput], j,
            );

            // if last stage -> override output (draw to screen)
            if (i === stages.length - 1 && j === stage.passes.length - 1) {
                output = null;
            } else if (!output) {
                output = this.renderTargets[stageOutput];
            }

            // render stage
            r.setRenderTarget(output);
            if (output) {
                r.clear();
            }
            r.setViewport(
                0, 0,
                output ? output.width : view.camera.width,
                output ? output.height : view.camera.height,
            );

            if (material) {
                // postprocessing scene
                this.mesh.material = material;
                if (output) {
                    this.mesh.material.transparent = false;
                    this.mesh.material.opacity = 1.0;
                } else {
                    this.mesh.material.transparent = true;
                    this.mesh.material.uniforms.opacity.value = opacity;
                }
                r.render(this.scene, this.camera);
            } else {
                r.render(view.scene, view.camera.camera3D);
            }
        }
        previousStageOutput = stageOutput;
    }

    r.setClearAlpha(oldClearAlpha);
};

function _createRenderTargets(view) {
    const renderTargets = [];
    renderTargets.push(new WebGLRenderTarget(view.camera.width, view.camera.height));
    renderTargets.push(new WebGLRenderTarget(view.camera.width, view.camera.height));
    renderTargets.push(new WebGLRenderTarget(view.camera.width, view.camera.height));
    renderTargets.push(
        new WebGLRenderTarget(view.camera.width * 0.5, view.camera.height * 0.5),
    );

    renderTargets[RT.FULL_RES_0].texture.minFilter = LinearFilter;
    renderTargets[RT.FULL_RES_0].texture.generateMipmaps = false;
    renderTargets[RT.FULL_RES_0].depthBuffer = true;
    renderTargets[RT.FULL_RES_0].texture.format = RGBAFormat;
    renderTargets[RT.FULL_RES_0].texture.minFilter = NearestFilter;
    renderTargets[RT.FULL_RES_0].texture.magFilter = NearestFilter;
    renderTargets[RT.FULL_RES_0].depthTexture = new DepthTexture();
    renderTargets[RT.FULL_RES_0].depthTexture.type = UnsignedShortType;

    renderTargets[RT.FULL_RES_1].texture.minFilter = LinearFilter;
    renderTargets[RT.FULL_RES_1].texture.generateMipmaps = false;
    renderTargets[RT.FULL_RES_1].depthBuffer = true;
    renderTargets[RT.FULL_RES_1].texture.format = RGBAFormat;
    renderTargets[RT.FULL_RES_1].texture.minFilter = NearestFilter;
    renderTargets[RT.FULL_RES_1].texture.magFilter = NearestFilter;
    renderTargets[RT.FULL_RES_1].depthTexture = new DepthTexture();
    renderTargets[RT.FULL_RES_1].depthTexture.type = UnsignedShortType;

    renderTargets[RT.EDL_VALUES] = new WebGLRenderTarget(
        view.camera.width, view.camera.height,
    );
    renderTargets[RT.EDL_VALUES].texture.generateMipmaps = false;
    renderTargets[RT.EDL_VALUES].depthBuffer = false;
    renderTargets[RT.EDL_VALUES].texture.format = RGBAFormat;
    renderTargets[RT.EDL_VALUES].texture.minFilter = NearestFilter;
    renderTargets[RT.EDL_VALUES].texture.magFilter = NearestFilter;

    renderTargets[RT.HALF_RES].texture.minFilter = LinearFilter;
    renderTargets[RT.HALF_RES].texture.generateMipmaps = false;
    renderTargets[RT.HALF_RES].depthBuffer = true;
    renderTargets[RT.HALF_RES].texture.format = RGBAFormat;
    renderTargets[RT.HALF_RES].texture.minFilter = NearestFilter;
    renderTargets[RT.HALF_RES].texture.magFilter = NearestFilter;
    renderTargets[RT.HALF_RES].depthTexture = new DepthTexture();
    renderTargets[RT.HALF_RES].depthTexture.type = UnsignedShortType;

    return renderTargets;
}

export default PointCloudRenderer;
