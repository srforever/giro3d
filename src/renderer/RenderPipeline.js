import {
    Camera,
    DepthTexture,
    FloatType,
    Material,
    Mesh,
    NearestFilter,
    Object3D,
    Scene,
    UnsignedByteType,
    WebGLRenderTarget,
    WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js';
import PointCloudRenderer from './PointCloudRenderer.js';
import RenderingOptions from './RenderingOptions.js';

const BUCKETS = {
    OPAQUE: 0,
    POINT_CLOUD: 1,
    TRANSPARENT: 2,
};

/**
 * @param {Mesh[]} meshes The meshes to update.
 * @param {boolean} visible The new material visibility.
 */
function setVisibility(meshes, visible) {
    for (let i = 0; i < meshes.length; i++) {
        meshes[i].material.visible = visible;
    }
}

/**
 * A render pipeline that supports various effects.
 */
export default class RenderPipeline {
    /**
     * @param {WebGLRenderer} renderer The WebGL renderer.
     */
    constructor(renderer) {
        this.renderer = renderer;

        /** @type {Mesh[][]} */
        this.buckets = [[], [], []];

        /** @type {WebGLRenderTarget} */
        this.sceneRenderTarget = null;
    }

    prepareRenderTargets(width, height) {
        if (!this.sceneRenderTarget
            || this.sceneRenderTarget.width !== width
            || this.sceneRenderTarget.height !== height) {
            this.sceneRenderTarget?.dispose();
            this.effectComposer?.dispose();

            const depthBufferType = this.renderer.capabilities.floatFragmentTextures
                ? FloatType
                : UnsignedByteType;

            // This is the render target that the initial rendering of scene will be:
            // opaque, transparent and point cloud buckets render into this.
            this.sceneRenderTarget = new WebGLRenderTarget(width, height, {
                generateMipmaps: false,
                magFilter: NearestFilter,
                minFilter: NearestFilter,
                depthBuffer: true,
                stencilBuffer: true,
                depthTexture: new DepthTexture(width, height, depthBufferType),
            });

            this.effectComposer = new EffectComposer(this.renderer);

            // After the buckets have been rendered into the render target,
            // the effect composer will render this render target to the canvas.
            this.effectComposer.addPass(new TexturePass(this.sceneRenderTarget.texture));
        }
    }

    /**
     * @param {Object3D} scene The scene to render.
     * @param {Camera} camera The camera to render.
     * @param {number} width The width in pixels of the render target.
     * @param {number} height The height in pixels of the render target.
     * @param {RenderingOptions} options The options.
     */
    render(scene, camera, width, height, options) {
        const renderer = this.renderer;

        this.prepareRenderTargets(width, height);

        renderer.setRenderTarget(this.sceneRenderTarget);

        this.collectRenderBuckets(scene);

        this.renderMeshes(scene, camera, this.buckets[BUCKETS.OPAQUE]);

        // Point cloud rendering adds special effects. To avoid applying those effects
        // to all objects in the scene, we separate the meshes into buckets, and
        // render those buckets separately.
        this.renderPointClouds(scene, camera, this.buckets[BUCKETS.POINT_CLOUD], options);

        this.renderMeshes(scene, camera, this.buckets[BUCKETS.TRANSPARENT]);

        // Finally, render to the canvas via the EffectComposer.
        this.effectComposer.render();

        this.onAfterRender();
    }

    /**
     * @param {Object3D} scene The scene to render.
     * @param {Camera} camera The camera.
     * @param {Mesh[]} meshes The meshes to render.
     * @param {RenderingOptions} opts The rendering options.
     */
    renderPointClouds(scene, camera, meshes, opts) {
        if (meshes.length === 0) {
            return;
        }

        if (!this.pointCloudRenderer) {
            this.pointCloudRenderer = new PointCloudRenderer(this.renderer);
        }

        const pcr = this.pointCloudRenderer;

        pcr.edl.enabled = opts.enableEDL;
        pcr.edl.parameters.radius = opts.EDLRadius;
        pcr.edl.parameters.strength = opts.EDLStrength;
        pcr.inpainting.enabled = opts.enableInpainting;
        pcr.inpainting.parameters.fill_steps = opts.inpaintingSteps;
        pcr.inpainting.parameters.depth_contrib = opts.inpaintingDepthContribution;
        pcr.occlusion.enabled = opts.enablePointCloudOcclusion;

        setVisibility(meshes, true);

        pcr.render(scene, camera, this.sceneRenderTarget);

        setVisibility(meshes, false);
    }

    /**
     * @param {Object3D} scene The scene to render.
     * @param {Camera} camera The camera.
     * @param {Mesh[]} meshes The meshes to render.
     */
    renderMeshes(scene, camera, meshes) {
        if (meshes.length === 0) {
            return;
        }

        const renderer = this.renderer;

        setVisibility(meshes, true);

        renderer.render(scene, camera);

        setVisibility(meshes, false);
    }

    onAfterRender() {
        // Reset the visibility of all rendered objects
        for (const bucket of this.buckets) {
            for (let i = 0; i < bucket.length; i++) {
                const mesh = bucket[i];
                mesh.material.visible = true;
            }
            bucket.length = 0;
        }
    }

    dispose() {
        this.effectComposer.dispose();
        this.sceneRenderTarget?.dispose();
        this.pointCloudRenderer?.dispose();
    }

    /**
     * @param {Scene} scene The root scene.
     */
    collectRenderBuckets(scene) {
        const renderBuckets = this.buckets;

        scene.traverse(obj => {
            /** @type {Material} */
            const material = obj.material;

            if (obj.visible && material && material.visible) {
                material.visible = false;

                if (obj.isPointCloud) {
                    // The point cloud bucket will receive special effects
                    renderBuckets[BUCKETS.POINT_CLOUD].push(obj);
                } else if (obj.material.transparent) {
                    renderBuckets[BUCKETS.TRANSPARENT].push(obj);
                } else {
                    renderBuckets[BUCKETS.OPAQUE].push(obj);
                }
            }
        });
    }
}
