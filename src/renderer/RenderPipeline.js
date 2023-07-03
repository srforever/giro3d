import {
    Color,
    DepthTexture,
    FloatType,
    Material,
    Mesh,
    NearestFilter,
    Scene,
    UnsignedByteType,
    WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js';
import { LuminosityShader } from 'three/examples/jsm/shaders/LuminosityShader.js';
import Instance from '../core/Instance.js';
import PointCloudRenderer from './PointCloudRenderer.js';

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

export default class RenderPipeline {
    /**
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(instance) {
        this.instance = instance;

        /** @type {Mesh[][]} */
        this.buckets = [[], [], []];

        /** @type {WebGLRenderTarget} */
        this.renderTarget = null;
    }

    prepareRenderTargets() {
        const camera = this.instance.camera;
        const renderer = this.instance.renderer;

        if (!this.renderTarget
            || this.renderTarget.width !== camera.width
            || this.renderTarget.height !== camera.height) {
            this.renderTarget?.dispose();
            this.composer?.dispose();

            const depthBufferType = renderer.capabilities.floatFragmentTextures
                ? FloatType
                : UnsignedByteType;

            this.renderTarget = new WebGLRenderTarget(camera.width, camera.height, {
                generateMipmaps: false,
                magFilter: NearestFilter,
                minFilter: NearestFilter,
                depthBuffer: true,
                stencilBuffer: true,
                depthTexture: new DepthTexture(camera.width, camera.height, depthBufferType),
            });

            this.composer = new EffectComposer(renderer);
            this.composer.addPass(new TexturePass(this.renderTarget.texture));
        }
    }

    render() {
        const scene = this.instance.scene;
        const renderer = this.instance.renderer;

        this.prepareRenderTargets();

        renderer.setViewport(0, 0, this.renderTarget.width, this.renderTarget.height);
        renderer.setRenderTarget(this.renderTarget);

        renderer.autoClear = false;
        renderer.clear();

        this.collectRenderBuckets(scene);

        this.renderMeshes(this.buckets[BUCKETS.OPAQUE]);

        this.renderPointClouds(this.buckets[BUCKETS.POINT_CLOUD]);

        this.renderMeshes(this.buckets[BUCKETS.TRANSPARENT]);

        // Finally, render to the canvas.
        this.composer.render();

        this.onAfterRender();
    }

    /**
     * @param {Mesh[]} meshes The meshes to render.
     */
    renderPointClouds(meshes) {
        if (meshes.length === 0) {
            return;
        }

        if (!this.pointCloudRenderer) {
            this.pointCloudRenderer = new PointCloudRenderer(this.instance);
            this.pointCloudRenderer.edl.enabled = true;
            this.pointCloudRenderer.inpainting.enabled = false;
            this.pointCloudRenderer.occlusion.enabled = false;
        }

        setVisibility(meshes, true);

        this.pointCloudRenderer.render({ renderTarget: this.renderTarget });

        setVisibility(meshes, false);
    }

    /**
     * @param {Mesh[]} meshes The meshes to render.
     */
    renderMeshes(meshes) {
        if (meshes.length === 0) {
            return;
        }

        const camera = this.instance.camera;
        const renderer = this.instance.renderer;
        const scene = this.instance.scene;

        setVisibility(meshes, true);

        renderer.render(scene, camera.camera3D);
        // engine.render(this.instance);

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
