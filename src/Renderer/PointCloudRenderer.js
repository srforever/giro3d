import * as THREE from 'three';
import BasicVS from './Shader/BasicVS.glsl';
import EDLPassOneFS from './Shader/PointCloud/EDLPassOneFS.glsl';
import EDLPassTwoFS from './Shader/PointCloud/EDLPassTwoFS.glsl';
import OcclusionFS from './Shader/PointCloud/OcclusionFS.glsl';
import InpaintingFS from './Shader/PointCloud/InpaintingFS.glsl';

const RT = {
    FULL_RES_0: 0,
    FULL_RES_1: 1,
    EDL_VALUES: 2,
};

function PointCloudRenderer(view) {
    this.scene = new THREE.Scene();

    // create 1 big triangle covering the screen
    const geom = new THREE.BufferGeometry();
    const vertices = [0, 0, -3, 2, 0, -3, 0, 2, -3];
    const uvs = [0, 0, 2, 0, 0, 2];
    geom.addAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.addAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    this.mesh = new THREE.Mesh(geom, null);
    // this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), null);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    // our camera
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 10);

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
            // EDL 1st pass material
            // This pass is writing a single value per pixel, describing the depth
            // difference between one pixel and its neighbours.
            new THREE.ShaderMaterial({
                uniforms: {
                    depthTexture: { value: null },
                    resolution: { value: new THREE.Vector2(256, 256) },
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
            new THREE.ShaderMaterial({
                uniforms: {
                    textureColor: { value: null },
                    textureEDL: { value: null },
                    opacity: { value: 1.0 },
                },
                vertexShader: BasicVS,
                fragmentShader: EDLPassTwoFS,
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
            if (passIdx == 0) {
                m.uniforms.depthTexture.value = input.depthTexture;
                m.uniforms.resolution.value.set(input.width, input.height);
                m.uniforms.cameraNear.value = renderer.view.camera.camera3D.near;
                m.uniforms.cameraFar.value = renderer.view.camera.camera3D.far;
                m.uniforms.radius.value = this.parameters.radius;
                m.uniforms.strength.value = this.parameters.strength;
                m.uniforms.directions.value = this.parameters.directions;
                m.uniforms.n.value = this.parameters.n;

                return { material: m, output: renderer.renderTargets[RT.EDL_VALUES] };
            } else {
                m.uniforms.textureColor.value = input.texture;
                m.uniforms.textureEDL.value = renderer.renderTargets[RT.EDL_VALUES].texture;

                return { material: m };
            }
        },
    };

    // Screen-space occlusion
    // References: http://www.crs4.it/vic/data/papers/vast2011-pbr.pdf
    this.occlusion = {
        passes: [
            // EDL 1st pass material
            // This pass is writing a single value per pixel, describing the depth
            // difference between one pixel and its neighbours.
            new THREE.ShaderMaterial({
                uniforms: {
                    depthTexture: { value: null },
                    colorTexture: { value: null },
                    m43: { value: 0 },
                    m33: { value: 0 },
                    resolution: { value: new THREE.Vector2(256, 256) },
                    invPersMatrix: { value: new THREE.Matrix4() },
                    threshold: { value: 0 },
                    showRemoved: { value: false },
                    clearColor: { value: new THREE.Color() },
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
            const mat = new THREE.Matrix4();
            mat.getInverse(renderer.view.camera.camera3D.projectionMatrix);

            m.uniforms.colorTexture.value = input.texture;
            m.uniforms.depthTexture.value = input.depthTexture;
            m.uniforms.resolution.value.set(
                input.width, input.height);
            m.uniforms.m43.value = m43;
            m.uniforms.m33.value = m33;
            m.uniforms.threshold.value = this.parameters.threshold;
            m.uniforms.showRemoved.value = this.parameters.showRemoved;
            m.uniforms.invPersMatrix.value.getInverse(renderer.view.camera.camera3D.projectionMatrix);
            m.uniforms.clearColor.value.copy(renderer.view.mainLoop.gfxEngine.renderer.getClearColor());

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
            new THREE.ShaderMaterial({
                uniforms: {
                    depthTexture: { value: null },
                    colorTexture: { value: null },
                    resolution: { value: new THREE.Vector2(256, 256) },
                    depth_contrib: { value: 0.5 },
                    opacity: { value: 1.0 },
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
        },
        setup(renderer, input) {
            const m = this.passes[0];

            m.uniforms.colorTexture.value = input.texture;
            m.uniforms.depthTexture.value = input.depthTexture;
            m.uniforms.resolution.value.set(input.width, input.height);
            m.uniforms.depth_contrib.value = this.parameters.depth_contrib;

            return { material: m };
        },
    };

    this.renderTargets = _createRenderTargets(view);

    this.view = view;
    view.addFrameRequester(() => {
        if (this.view.camera.width != this.renderTargets[RT.FULL_RES_0].width ||
            this.view.camera.width != this.renderTargets[RT.FULL_RES_0].height) {
            // release old render targets
            this.renderTargets.forEach(rt => rt.dispose());
            // build new ones
            this.renderTargets = _createRenderTargets(view);
        }
    });
}

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
            let { material, output } = stage.setup(this, this.renderTargets[previousStageOutput], j);

            // if last stage -> override output (draw to screen)
            if (i == stages.length - 1 && j == stage.passes.length - 1) {
                output = null;
            } else if (!output) {
                output = this.renderTargets[stageOutput];
            }

            // render stage
            r.setRenderTarget(output);
            if (output) {
                r.clearTarget(output);
            }
            r.setViewport(
                0, 0,
                output ? output.width : view.camera.width,
                output ? output.height : view.camera.height);

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
                r.render(this.scene, this.camera, output);
            } else {
                r.render(view.scene, view.camera.camera3D, output);
            }
        }
        previousStageOutput = stageOutput;
    }

    r.setClearAlpha(oldClearAlpha);
};


function _createRenderTargets(view) {
    const renderTargets = [];
    renderTargets.push(new THREE.WebGLRenderTarget(view.camera.width, view.camera.height));
    renderTargets.push(new THREE.WebGLRenderTarget(view.camera.width, view.camera.height));
    renderTargets.push(new THREE.WebGLRenderTarget(view.camera.width, view.camera.height));

    renderTargets[RT.FULL_RES_0].texture.minFilter = THREE.LinearFilter;
    renderTargets[RT.FULL_RES_0].texture.generateMipmaps = false;
    renderTargets[RT.FULL_RES_0].depthBuffer = true;
    renderTargets[RT.FULL_RES_0].texture.format = THREE.RGBAFormat;
    renderTargets[RT.FULL_RES_0].texture.minFilter = THREE.NearestFilter;
    renderTargets[RT.FULL_RES_0].texture.magFilter = THREE.NearestFilter;
    renderTargets[RT.FULL_RES_0].depthTexture = new THREE.DepthTexture();
    renderTargets[RT.FULL_RES_0].depthTexture.type = THREE.UnsignedShortType;

    renderTargets[RT.FULL_RES_1].texture.minFilter = THREE.LinearFilter;
    renderTargets[RT.FULL_RES_1].texture.generateMipmaps = false;
    renderTargets[RT.FULL_RES_1].depthBuffer = true;
    renderTargets[RT.FULL_RES_1].texture.format = THREE.RGBAFormat;
    renderTargets[RT.FULL_RES_1].texture.minFilter = THREE.NearestFilter;
    renderTargets[RT.FULL_RES_1].texture.magFilter = THREE.NearestFilter;
    renderTargets[RT.FULL_RES_1].depthTexture = new THREE.DepthTexture();
    renderTargets[RT.FULL_RES_1].depthTexture.type = THREE.UnsignedShortType;

    renderTargets[RT.EDL_VALUES] = new THREE.WebGLRenderTarget(view.camera.width, view.camera.height);
    renderTargets[RT.EDL_VALUES].texture.generateMipmaps = false;
    renderTargets[RT.EDL_VALUES].depthBuffer = false;
    renderTargets[RT.EDL_VALUES].texture.format = THREE.RGBAFormat;
    renderTargets[RT.EDL_VALUES].texture.minFilter = THREE.NearestFilter;
    renderTargets[RT.EDL_VALUES].texture.magFilter = THREE.NearestFilter;

    return renderTargets;
}

export default PointCloudRenderer;
