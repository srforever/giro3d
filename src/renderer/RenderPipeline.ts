import type {
    Camera,
    Material,
    Object3D,
    WebGLRenderer,
} from 'three';
import {
    DepthTexture,
    FloatType,
    NearestFilter,
    UnsignedByteType,
    WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js';
import PointCloudRenderer from './PointCloudRenderer';
import type RenderingOptions from './RenderingOptions';

const BUCKETS = {
    OPAQUE: 0,
    POINT_CLOUD: 1,
    TRANSPARENT: 2,
};

/**
 * Can be a Mesh or a PointCloud for instance
 */
type Object3DWithMaterial = Object3D & {
    material: Material,
};

/**
 * @param meshes The meshes to update.
 * @param visible The new material visibility.
 */
function setVisibility(meshes: Object3DWithMaterial[], visible: boolean) {
    for (let i = 0; i < meshes.length; i++) {
        meshes[i].material.visible = visible;
    }
}

/**
 * A render pipeline that supports various effects.
 */
export default class RenderPipeline {
    renderer: WebGLRenderer;
    buckets: Object3DWithMaterial[][];
    sceneRenderTarget: WebGLRenderTarget | null;
    effectComposer?: EffectComposer;
    pointCloudRenderer?: PointCloudRenderer;

    /**
     * @param renderer The WebGL renderer.
     */
    constructor(renderer: WebGLRenderer) {
        this.renderer = renderer;

        this.buckets = [[], [], []];

        this.sceneRenderTarget = null;
    }

    prepareRenderTargets(width: number, height: number) {
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
                depthTexture: new DepthTexture(width, height, depthBufferType),
            });

            this.effectComposer = new EffectComposer(this.renderer);

            // After the buckets have been rendered into the render target,
            // the effect composer will render this render target to the canvas.
            this.effectComposer.addPass(new TexturePass(this.sceneRenderTarget.texture));
        }
    }

    /**
     * @param scene The scene to render.
     * @param camera The camera to render.
     * @param width The width in pixels of the render target.
     * @param height The height in pixels of the render target.
     * @param options The options.
     */
    render(
        scene: Object3D,
        camera: Camera,
        width: number,
        height: number,
        options: RenderingOptions,
    ) {
        const renderer = this.renderer;

        this.prepareRenderTargets(width, height);

        renderer.setRenderTarget(this.sceneRenderTarget);

        this.collectRenderBuckets(scene);

        // Ensure that any background (texture or skybox) is properly handled
        // by rendering it separately first.
        this.renderer.clear();
        this.renderer.render(scene, camera);

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
     * @param scene The scene to render.
     * @param camera The camera.
     * @param meshes The meshes to render.
     * @param opts The rendering options.
     */
    renderPointClouds(
        scene: Object3D,
        camera: Camera,
        meshes: Object3DWithMaterial[],
        opts: RenderingOptions,
    ) {
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
     * @param scene The scene to render.
     * @param camera The camera.
     * @param meshes The meshes to render.
     */
    renderMeshes(scene: Object3D, camera: Camera, meshes: Object3DWithMaterial[]) {
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
            setVisibility(bucket, true);
            bucket.length = 0;
        }
    }

    dispose() {
        this.effectComposer.dispose();
        this.sceneRenderTarget?.dispose();
        this.pointCloudRenderer?.dispose();
    }

    /**
     * @param scene The root scene.
     */
    collectRenderBuckets(scene: Object3D) {
        const renderBuckets = this.buckets;

        scene.traverse(obj => {
            const mesh = obj as Object3DWithMaterial;
            const material = mesh.material;

            if (mesh.visible && material && material.visible) {
                material.visible = false;

                if ((mesh as any).isPointCloud) {
                    // The point cloud bucket will receive special effects
                    renderBuckets[BUCKETS.POINT_CLOUD].push(mesh);
                } else if (mesh.material.transparent) {
                    renderBuckets[BUCKETS.TRANSPARENT].push(mesh);
                } else {
                    renderBuckets[BUCKETS.OPAQUE].push(mesh);
                }
            }
        });
    }
}
