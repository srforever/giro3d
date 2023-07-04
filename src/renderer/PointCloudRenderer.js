import {
    BufferGeometry,
    Color,
    DepthTexture,
    Float32BufferAttribute,
    FloatType,
    Matrix4,
    Mesh,
    NearestFilter,
    NormalBlending,
    OrthographicCamera,
    RGBAFormat,
    Scene,
    ShaderMaterial,
    UnsignedByteType,
    Vector2,
    WebGLRenderTarget,
    WebGLRenderer,
} from 'three';
import BasicVS from './shader/BasicVS.glsl';
import EDLPassZeroFS from './shader/pointcloud/EDLPassZeroFS.glsl';
import EDLPassOneFS from './shader/pointcloud/EDLPassOneFS.glsl';
import EDLPassTwoFS from './shader/pointcloud/EDLPassTwoFS.glsl';
import OcclusionFS from './shader/pointcloud/OcclusionFS.glsl';
import InpaintingFS from './shader/pointcloud/InpaintingFS.glsl';

const RT = {
    FULL_RES_0: 0,
    FULL_RES_1: 1,
    EDL_VALUES: 2,
    EDL_ZERO: 3,
};

/**
 * @typedef {object} Stage
 * @property {ShaderMaterial[]} passes The render passes of this stage.
 * @property {object} parameters The parameters of this stage.
 * @property {boolean} enabled Is the stage enabled ?
 * @property {Function} setup The setup function.
 */

/**
 * A post-processing renderer that adds effects to point clouds.
 */
class PointCloudRenderer {
    /**
     * Creates a point cloud renderer.
     *
     * @param {WebGLRenderer} webGLRenderer The WebGL renderer.
     */
    constructor(webGLRenderer) {
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

        /** @type {Stage} */
        this.classic = {
            passes: [undefined],
            enabled: true,
            setup() { return { material: undefined }; },
        };

        // E(ye)D(ome)L(ighting) setup
        // References:
        //    - https://tel.archives-ouvertes.fr/tel-00438464/document
        //    - Potree (https://github.com/potree/potree/)
        /** @type {Stage} */
        this.edl = {
            passes: [
                new ShaderMaterial({
                    uniforms: {
                        depthTexture: { value: null },
                    },
                    transparent: true,
                    blending: NormalBlending,
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
                    transparent: true,
                    blending: NormalBlending,
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
                    transparent: true,
                    blending: NormalBlending,
                    vertexShader: BasicVS,
                    fragmentShader: EDLPassTwoFS,
                    extensions: { fragDepth: true },
                }),
            ],
            enabled: true,
            // EDL tuning
            parameters: {
                // distance to neighbours pixels
                radius: 1.5,
                // edl value coefficient
                strength: 0.7,
                // directions count where neighbours are taken
                directions: 8,
                // how many neighbours per direction
                n: 1,
            },
            setup({
                renderer, input, passIdx, camera,
            }) {
                const m = this.passes[passIdx];
                const uniforms = m.uniforms;
                if (passIdx === 0) {
                    // scale down depth texture
                    uniforms.depthTexture.value = input.depthTexture;
                    return { material: m, output: renderer.renderTargets[RT.EDL_ZERO] };
                }
                if (passIdx === 1) {
                    uniforms.depthTexture.value = renderer.renderTargets[RT.EDL_ZERO].depthTexture;
                    uniforms.resolution.value.set(input.width, input.height);
                    uniforms.cameraNear.value = camera.near;
                    uniforms.cameraFar.value = camera.far;
                    uniforms.radius.value = this.parameters.radius;
                    uniforms.strength.value = this.parameters.strength;
                    uniforms.directions.value = this.parameters.directions;
                    uniforms.n.value = this.parameters.n;
                    return { material: m, output: renderer.renderTargets[RT.EDL_VALUES] };
                }
                uniforms.textureColor.value = input.texture;
                uniforms.textureEDL.value = renderer.renderTargets[RT.EDL_VALUES].texture;
                uniforms.depthTexture.value = input.depthTexture;

                return { material: m };
            },
        };

        // Screen-space occlusion
        // References: http://www.crs4.it/vic/data/papers/vast2011-pbr.pdf
        /** @type {Stage} */
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
                    transparent: true,
                    blending: NormalBlending,
                    vertexShader: BasicVS,
                    fragmentShader: OcclusionFS,
                    extensions: { fragDepth: true },
                }),
            ],
            enabled: true,
            // EDL tuning
            parameters: {
                // pixel suppression threshold
                threshold: 0.9,
                // debug feature to colorize removed pixels
                showRemoved: false,
            },
            setup({ renderer, input, camera }) {
                const m = this.passes[0];
                const n = camera.near;
                const f = camera.far;
                const m43 = -(2 * f * n) / (f - n);
                const m33 = -(f + n) / (f - n);
                const mat = new Matrix4();
                mat.copy(camera.projectionMatrix).invert();

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
                mU.invPersMatrix.value.copy(camera.projectionMatrix)
                    .invert();
                renderer.renderer.getClearColor(mU.clearColor.value);

                return { material: m };
            },
        };

        // Screen-space filling
        // References: http://www.crs4.it/vic/data/papers/vast2011-pbr.pdf
        /** @type {Stage} */
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
                    transparent: true,
                    blending: NormalBlending,
                    vertexShader: BasicVS,
                    fragmentShader: InpaintingFS,
                    extensions: { fragDepth: true },
                }),
            ],
            enabled: true,
            // EDL tuning
            parameters: {
                // how many fill step should be performed
                fill_steps: 2,
                // depth contribution to the final color (?)
                depth_contrib: 0.5,
                enableZAttenuation: false,
                zAttMin: 10,
                zAttMax: 100,
            },
            setup({ input, camera }) {
                const m = this.passes[0];
                const n = camera.near;
                const f = camera.far;
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

        /** @type {WebGLRenderer} */
        this.renderer = webGLRenderer;
        this.renderTargets = null;
    }

    updateRenderTargets(renderTarget) {
        if (!this.renderTargets
            || renderTarget.width !== this.renderTargets[RT.FULL_RES_0].width
            || renderTarget.height !== this.renderTargets[RT.FULL_RES_0].height) {
            // release old render targets
            this.renderTargets.forEach(rt => rt.dispose());
            // build new ones
            this.renderTargets = this.createRenderTargets(renderTarget.width, renderTarget.height);
        }
    }

    createRenderTarget(width, height, depthBuffer) {
        const supportsFloatTextures = this.renderer.capabilities.floatFragmentTextures;
        return new WebGLRenderTarget(width, height, {
            format: RGBAFormat,
            depthBuffer,
            stencilBuffer: true,
            generateMipmaps: false,
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            depthTexture: depthBuffer
                ? new DepthTexture(width, height, supportsFloatTextures
                    ? FloatType
                    : UnsignedByteType)
                : undefined,
        });
    }

    createRenderTargets(width, height) {
        const renderTargets = [];

        renderTargets.push(this.createRenderTarget(width, height, true));
        renderTargets.push(this.createRenderTarget(width, height, true));
        renderTargets.push(this.createRenderTarget(width, height, false));
        renderTargets.push(this.createRenderTarget(width, height, true));

        return renderTargets;
    }

    render(scene, camera, renderTarget) {
        this.updateRenderTargets(renderTarget);

        const g = this.instance.mainLoop.gfxEngine;
        /** @type {WebGLRenderer} */
        const r = g.renderer;

        /** @type {Stage[]} */
        const stages = [];

        stages.push(this.classic);

        if (this.occlusion.enabled) {
            stages.push(this.occlusion);
        }
        if (this.inpainting.enabled) {
            for (let i = 0; i < this.inpainting.parameters.fill_steps; i++) {
                stages.push(this.inpainting);
            }
        }
        if (this.edl.enabled) {
            stages.push(this.edl);
        }

        const oldClearAlpha = r.getClearAlpha();
        // r.setClearAlpha(0.0);

        let previousStageOutput = RT.FULL_RES_0;
        for (let i = 0; i < stages.length; i++) {
            const stage = stages[i];

            // ping-pong between FULL_RES_0 and FULL_RES_1, unless overriden by stage
            const stageOutput = (previousStageOutput + 1) % 2;
            for (let j = 0; j < stage.passes.length; j++) {
                // prepare stage
                // eslint-disable-next-line prefer-const
                let { material, output } = stage.setup({
                    renderer: this,
                    input: this.renderTargets[previousStageOutput],
                    passIdx: j,
                    camera,
                });

                // if last stage -> override output (draw to screen)
                if (i === stages.length - 1 && j === stage.passes.length - 1) {
                    output = renderTarget ?? null;
                } else if (!output) {
                    output = this.renderTargets[stageOutput];
                }

                // render stage
                r.setRenderTarget(output);

                // We don't want to clear the final render target
                // because it would erase whatever was rendered previously
                // (i.e opaque non-point cloud meshes)
                if (output !== renderTarget) {
                    r.clear();
                }
                r.setViewport(
                    0, 0,
                    output ? output.width : camera.width,
                    output ? output.height : camera.height,
                );

                if (material) {
                    // postprocessing scene
                    this.mesh.material = material;
                    r.render(this.scene, this.camera);
                } else {
                    r.render(scene, camera);
                }
            }
            previousStageOutput = stageOutput;
        }

        r.setClearAlpha(oldClearAlpha);
    }

    dispose() {
        this.renderTargets.forEach(t => t.dispose());
        this.renderTargets.length = 0;
    }
}

export default PointCloudRenderer;
