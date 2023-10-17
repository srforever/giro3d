import {
    type CanvasTexture,
    type DataTexture,
    type Material,
    MathUtils,
    Mesh,
    PlaneGeometry,
    type Texture,
    Vector2,
    type WebGLRenderer,
    type WebGLRenderTarget,
} from 'three';
import type Extent from '../geographic/Extent';
import type Interpretation from './Interpretation';
import WebGLComposer, { type DrawOptions } from '../../renderer/composition/WebGLComposer';
import Rect from '../Rect.js';
import MemoryTracker from '../../renderer/MemoryTracker.js';
import TextureGenerator from '../../utils/TextureGenerator';
import ProjUtils from '../../utils/ProjUtils';

const tmpVec2 = new Vector2();

/**
 * Removes the texture data from CPU memory.
 * Important: this should only be done **after** the texture has been uploaded to the GPU.
 *
 * @param texture The texture to purge.
 */
function onTextureUploaded(texture: Texture) {
    if ((texture as DataTexture).isDataTexture) {
        texture.image.data = null;
    } else if ((texture as CanvasTexture).isCanvasTexture) {
        texture.source.data = null;
    }
}

interface TextureWithMinMax extends Texture {
    min?: number;
    max?: number;
}

/**
 * @param texture The texture to process.
 * @param options Options.
 * @param options.interpretation The interpretation.
 * @param options.noDataValue The no-data value.
 */
function processMinMax(texture: TextureWithMinMax, {
    interpretation,
    noDataValue,
}: {
    interpretation: Interpretation;
    noDataValue: number;
}) {
    if (texture.min != null && texture.max != null) {
        return { min: texture.min, max: texture.max };
    }

    if ((texture as DataTexture).isDataTexture) {
        return TextureGenerator.computeMinMax(texture.image.data, noDataValue, interpretation);
    }
    if ((texture as CanvasTexture).isCanvasTexture) {
        return TextureGenerator.computeMinMaxFromImage(texture.image, interpretation);
    }

    throw new Error('no min/max could be computed from texture');
}

enum State {
    /**
     * The image was not used at all during this render cycle.
     */
    NotUsed = 0,
    /**
     * The image was used this cycle for at least one render.
     */
    Used = 1,
}

class Image {
    readonly id: string;
    readonly mesh: Mesh;
    state: State;
    lastUsed: number;
    readonly extent: Extent;
    readonly texture: Texture;
    readonly alwaysVisible: boolean;
    readonly material: Material;
    readonly min: number;
    readonly max: number;
    disposed: boolean;
    readonly owners: Set<number>;

    constructor(options: {
        id: string;
        mesh: Mesh;
        texture: Texture;
        extent: Extent;
        alwaysVisible: boolean;
        min: number;
        max: number;
    }) {
        this.id = options.id;
        this.mesh = options.mesh;
        this.state = State.NotUsed;
        this.lastUsed = performance.now();
        this.extent = options.extent;
        this.texture = options.texture;
        this.alwaysVisible = options.alwaysVisible ?? false;
        this.material = this.mesh.material as Material;
        this.min = options.min;
        this.max = options.max;
        this.disposed = false;
        this.owners = new Set();
    }

    canBeDeleted() {
        return !this.alwaysVisible && this.owners.size === 0;
    }

    set visible(v) {
        this.mesh.visible = v;
    }

    get visible() {
        return this.mesh.visible;
    }

    set opacity(v) {
        this.material.opacity = v;
    }

    get opacity() {
        return this.material.opacity;
    }

    dispose() {
        if (this.disposed) {
            throw new Error('already disposed');
        }
        this.disposed = true;
        this.texture?.dispose();
    }
}

class LayerComposer {
    readonly computeMinMax: boolean;
    readonly extent: Extent;
    readonly dimensions: Vector2;
    readonly images: Map<string, Image>;
    readonly webGLRenderer: WebGLRenderer;
    readonly transparent: boolean;
    readonly noDataValue: number;
    readonly sourceCrs: string;
    readonly targetCrs: string;
    readonly needsReprojection: boolean;
    readonly interpretation: Interpretation;
    readonly composer: WebGLComposer;

    disposed: boolean;
    now: number;
    needsCleanup: boolean;

    /**
     * @param options The options.
     * @param options.renderer The WebGLRenderer.
     * @param options.computeMinMax Compute min/max on generated images.
     * @param options.transparent Enables transparency.
     * @param options.noDataValue The no-data value.
     * @param options.sourceCrs The CRS of the source.
     * @param options.extent The extent.
     * @param options.showImageOutlines Show image outlines.
     * @param options.targetCrs The target CRS of this composer.
     * @param options.interpretation The interpretation of the layer.
     */
    constructor(options: {
        renderer: WebGLRenderer;
        computeMinMax: boolean;
        transparent?: boolean;
        noDataValue?: number;
        sourceCrs: string;
        extent: Extent;
        showImageOutlines: boolean;
        targetCrs: string;
        interpretation: Interpretation;
    }) {
        this.computeMinMax = options.computeMinMax;
        this.extent = options.extent;
        this.dimensions = this.extent ? this.extent.dimensions() : null;
        this.images = new Map();
        this.webGLRenderer = options.renderer;
        this.transparent = options.transparent;
        this.noDataValue = options.noDataValue;
        this.sourceCrs = options.sourceCrs;
        this.targetCrs = options.targetCrs;
        this.needsReprojection = this.sourceCrs !== this.targetCrs;
        this.interpretation = options.interpretation;

        this.composer = new WebGLComposer({
            webGLRenderer: options.renderer,
            extent: this.extent ? Rect.fromExtent(this.extent) : null,
            showImageOutlines: options.showImageOutlines,
        });

        this.disposed = false;
        this.now = performance.now();
        this.needsCleanup = false;
    }

    /**
     * Prevents the specified image from being removed during the cleanup step.
     *
     * @param id The image ID to lock.
     * @param nodeId The node id.
     */
    lock(id: string, nodeId: number) {
        const img = this.images.get(id);
        if (img) {
            img.owners.add(nodeId);
        }
    }

    /**
     * Allows the specified images to be removed during the cleanup step.
     *
     * @param ids The image id to unlock.
     * @param nodeId The node id.
     */
    unlock(ids: Set<string>, nodeId: number) {
        ids.forEach(id => {
            const image = this.images.get(id);
            if (image) {
                image.owners.delete(nodeId);
                if (image.owners.size === 0) {
                    this.needsCleanup = true;
                }
            }
        });
    }

    /**
     * Computes the distance between the composition camera and the image.
     *
     * Smaller images will be closer to the camera.
     *
     * @param extent The extent.
     * @returns The distance between the camera and the image.
     */
    private computeZDistance(extent: Extent): number {
        if (this.dimensions) {
            const width = extent.dimensions(tmpVec2).x;
            // Since we don't know the smallest size of image that the source will output,
            // let's make a generous assumptions: the smallest image is 1/2^25 of the extent.
            const MAX_NUMBER_OF_SUBDIVISIONS = 33554432; // 2^25
            const SMALLEST_WIDTH = this.dimensions.x / MAX_NUMBER_OF_SUBDIVISIONS;
            return MathUtils.mapLinear(width, this.dimensions.x, SMALLEST_WIDTH, 0, 9);
        }

        return 0;
    }

    private preprocessImage(extent: Extent, texture: TextureWithMinMax, options: {
        fillNoData: boolean;
        interpretation: Interpretation;
        flipY: boolean;
        fillNoDataAlphaReplacement: number;
        fillNoDataRadius: number;
    }) {
        const rect = Rect.fromExtent(extent);
        const comp = new WebGLComposer({
            extent: rect,
            width: texture.image.width,
            height: texture.image.height,
            webGLRenderer: this.webGLRenderer,
        });

        // The fill no-data radius is expressed in CRS units in the API,
        // but in UV space in the shader. A conversion is necessary.
        let noDataRadiusInUVSpace = 1; // Default is no limit.
        if (Number.isFinite(options.fillNoDataRadius)) {
            const dims = extent.dimensions(tmpVec2);
            noDataRadiusInUVSpace = options.fillNoDataRadius / dims.width;
        }

        comp.draw(texture, rect, {
            fillNoData: options.fillNoData,
            fillNoDataAlphaReplacement: options.fillNoDataAlphaReplacement,
            fillNoDataRadius: noDataRadiusInUVSpace,
            interpretation: options.interpretation,
            flipY: options.flipY,
            transparent: this.transparent,
        });

        const result = comp.render() as TextureWithMinMax;
        result.name = 'LayerComposer - temporary';

        result.min = texture.min;
        result.max = texture.max;

        comp.dispose();
        texture.dispose();

        return result;
    }

    /**
     * Creates a lattice mesh whose each vertex has been warped to the target CRS.
     *
     * @param sourceExtent The source extent of the mesh to reproject, in the CRS of the source.
     * @param segments The number of subdivisions of the lattice.
     * A high value will create more faithful reprojections, at the cost of performance.
     */
    private createWarpedMesh(sourceExtent: Extent, segments: number = 8) {
        const dims = sourceExtent.dimensions(tmpVec2);
        const center = sourceExtent.center(new Vector2()) as Vector2;
        const geometry = new PlaneGeometry(dims.x, dims.y, segments, segments);

        const positionAttribute = geometry.getAttribute('position');

        ProjUtils.transformBufferInPlace(positionAttribute.array, {
            srcCrs: this.sourceCrs,
            dstCrs: this.targetCrs,
            offsetX: center.x,
            offsetY: center.y,
            stride: 3,
        });

        positionAttribute.needsUpdate = true;
        geometry.computeBoundingBox();

        // Note: the material will be set by the WebGLComposer itself.
        return new Mesh(geometry);
    }

    /**
     * Adds a texture into the composer space.
     *
     * @param options opts
     * @param options.texture The texture.
     * @param options.extent The geographic extent of the texture.
     * @param options.flipY Flip the image vertically.
     * @param options.fillNoData Fill no-data values of the image.
     * @param options.fillNoDataRadius Fill no-data maximum radius.
     * @param options.fillNoDataAlphaReplacement Alpha value for no-data pixels (after replacement)
     * @param options.alwaysVisible Force constant visibility of this image.
     * @param options.id The image ID.
     * @param options.min The min value of the texture.
     * @param options.max The max value of the texture.
     */
    add(options: {
        id: string;
        texture: Texture;
        extent: Extent;
        flipY?: boolean;
        min?: number;
        max?: number;
        fillNoData?: boolean;
        fillNoDataRadius?: number;
        fillNoDataAlphaReplacement?: number;
        alwaysVisible?: boolean;
    }) {
        const {
            extent, texture, id,
        } = options;

        if (this.images.has(id)) {
            // We already have this image.
            return;
        }

        // This is valid : the source returned a null texture (the area is empty for example).
        // We accept that, but there is nothing to do in the composer.
        if (texture == null) {
            return;
        }

        let actualTexture = texture;

        if (this.computeMinMax && options.min == null && options.max == null) {
            const { min, max } = processMinMax(actualTexture, {
                interpretation: this.interpretation,
                noDataValue: this.noDataValue,
            });
            options.min = min;
            options.max = max;
        }

        // If the image needs some preprocessing, let's do it now
        if (options.flipY || options.fillNoData || !this.interpretation.isDefault()) {
            actualTexture = this.preprocessImage(extent, texture, {
                fillNoData: options.fillNoData,
                flipY: options.flipY,
                interpretation: this.interpretation,
                fillNoDataAlphaReplacement: options.fillNoDataAlphaReplacement,
                fillNoDataRadius: options.fillNoDataRadius,
            });
        }

        let mesh;
        const composerOptions : DrawOptions = {
            transparent: this.transparent,
            zOrder: this.computeZDistance(extent),
        };
        if (this.needsReprojection) {
            // Draw a warped image
            const warpedMesh = this.createWarpedMesh(extent);
            mesh = this.composer.drawMesh(actualTexture, warpedMesh, composerOptions);
        } else {
            // Draw a rectangular image
            mesh = this.composer.draw(actualTexture, Rect.fromExtent(extent), composerOptions);
        }

        if (MemoryTracker.enable) {
            MemoryTracker.track(actualTexture, `LayerComposer - texture ${id}`);
        }

        // Register a handler to be notified when the texture has been uploaded to the GPU
        // so that we can reclaim the texture data and free memory.
        texture.onUpdate = () => onTextureUploaded(texture);

        const image = new Image({
            id,
            mesh,
            texture: actualTexture,
            extent,
            alwaysVisible: options.alwaysVisible,
            min: options.min,
            max: options.max,
        });

        this.images.set(id, image);
    }

    /**
     * Gets whether this composer contains the specified image.
     *
     * @param imageId The image ID.
     * @returns True if the composer contains the image.
     */
    has(imageId: string): boolean {
        return this.images.has(imageId);
    }

    /**
     * Copies the source texture into the destination texture, taking into account the extent
     * of both textures.
     *
     * @param options Options.
     * @param options.targetExtent The extent of the destination texture.
     * @param options.source The source render targets.
     * @param options.dest The destination render target.
     */
    copy(options: {
        targetExtent: Extent;
        source: {
            texture: TextureWithMinMax;
            extent: Extent;
        }[];
        dest: WebGLRenderTarget;
    }) {
        const targetExtent = options.targetExtent;
        const target = options.dest;

        const meshes = [];

        let min = +Infinity;
        let max = -Infinity;

        for (const { texture, extent } of options.source) {
            const sourceExtent = extent;

            const mesh = this.composer.draw(
                texture,
                Rect.fromExtent(sourceExtent),
            );

            meshes.push(mesh);

            min = Math.min(min, texture.min);
            max = Math.max(max, texture.max);
        }

        // Ensure that other images are not visible: we are only
        // interested in the images passed as parameters.
        for (const img of this.images.values()) {
            img.visible = false;
        }

        this.composer.render({
            rect: Rect.fromExtent(targetExtent),
            target,
            width: target.width,
            height: target.height,
        });

        const targetTexture = target.texture as TextureWithMinMax;
        targetTexture.min = min;
        targetTexture.max = max;

        for (const mesh of meshes) {
            this.composer.remove(mesh);
        }
    }

    /**
     * Clears the target texture.
     *
     * @param options The options.
     * @param options.extent The geographic extent of the region.
     * @param options.width The width, in pixels of the target texture.
     * @param options.height The height, in pixels of the target texture.
     * @param options.clear Clears the target texture.
     * @param options.target The optional render target.
     */
    clearTexture(options: {
        extent: Extent;
        width: number;
        height: number;
        clear: boolean;
        target: WebGLRenderTarget;
    }) {
        const {
            extent,
            width,
            height,
            target,
        } = options;

        this.images.forEach(img => { img.visible = false; });

        this.composer.render({
            width,
            height,
            rect: Rect.fromExtent(extent),
            target,
        });
    }

    /**
     * Returns the min/max values for images that overlap the specified extent.
     *
     * @param extent The extent.
     */
    getMinMax(extent: Extent) {
        let min = +Infinity;
        let max = -Infinity;

        this.images.forEach(image => {
            if (extent.intersectsExtent(image.extent)) {
                min = Math.min(image.min, min);
                max = Math.max(image.max, max);
            }
        });

        return { min, max };
    }

    /**
     * Renders a region of the composer space into a texture.
     *
     * @param options The options.
     * @param options.extent The geographic extent of the region.
     * @param options.width The width, in pixels of the target texture.
     * @param options.height The height, in pixels of the target texture.
     * @param options.clear Clears the target texture.
     * @param options.imageIds The image ids to render.
     * @param options.isFallbackMode Fallback mode.
     * @param options.target The optional render target.
     */
    render(options: {
        extent: Extent;
        width: number;
        height: number;
        clear?: boolean;
        imageIds: Set<string>;
        isFallbackMode?: boolean;
        target: WebGLRenderTarget;
    }) {
        const {
            extent,
            width,
            height,
            target,
            imageIds,
        } = options;

        // Do we have all the required images for this tile ?
        let allImagesReady = true;
        for (const id of imageIds.values()) {
            if (!this.images.has(id)) {
                allImagesReady = false;
                break;
            }
        }

        // To render the requested region, the composer needs to
        // find all images that are relevant :
        // - images that are explictly requested (with the imageIds option) -or-
        // - (fallback mode) images that simply intersect the region
        const isFallbackMode = options.isFallbackMode ?? !allImagesReady;

        // Is this render the last one to do for this request,
        // or will we need more renders in the future ?
        const isLastRender = !isFallbackMode;

        let min = +Infinity;
        let max = -Infinity;

        // Set image visibility
        for (const image of this.images.values()) {
            const isRequired = imageIds.has(image.id);

            const isInView = extent.intersectsExtent(image.extent) && image.alwaysVisible;

            image.visible = (isFallbackMode && isInView) || isRequired;

            // An image should be visible:
            // - if its is part of the required images,
            // - if no required images are available (fallback mode)
            if (image.visible) {
                image.state = State.Used;
                image.opacity = 1;
            }

            if (this.computeMinMax && isRequired) {
                min = Math.min(image.min, min);
                max = Math.max(image.max, max);
            }
        }

        // We didn't have exact images for this request, so we will need to
        // compute an approximate minmax from existing images.
        if (this.computeMinMax && isFallbackMode
            && (!Number.isFinite(min) || !Number.isFinite(max))) {
            for (const image of this.images.values()) {
                if (extent.intersectsExtent(image.extent)) {
                    min = Math.min(image.min, min);
                    max = Math.max(image.max, max);
                }
            }
        }

        const texture = this.composer.render({
            width,
            height,
            rect: Rect.fromExtent(extent),
            target,
        }) as TextureWithMinMax;

        texture.min = min;
        texture.max = max;

        return { texture, isLastRender };
    }

    postUpdate() {
        this.now = performance.now();

        if (this.needsCleanup) {
            this.cleanup();
            this.needsCleanup = false;
        }

        for (const image of this.images.values()) {
            switch (image.state) {
                case State.Used:
                    image.opacity = 1;
                    image.lastUsed = this.now;
                    image.state = State.NotUsed;
                    break;
                default:
                    image.opacity = image.alwaysVisible ? 1 : 0;
                    image.lastUsed = null;
                    break;
            }
        }

        return false;
    }

    cleanup() {
        // Delete eligible images.
        for (const img of Array.from(this.images.values())) {
            if (img.canBeDeleted()) {
                // In the case of reprojection, the mesh's geometry
                // is owned by this layer composer.
                if (this.needsReprojection) {
                    img.mesh.geometry.dispose();
                }
                this.composer.remove(img.mesh);
                img.dispose();
                this.images.delete(img.id);
            }
        }
    }

    /**
     * Clears the composer.
     */
    clear() {
        this.images.forEach(img => img.texture.dispose());
        this.images.clear();
        this.composer.reset();
    }

    /**
     * Disposes the composer.
     */
    dispose() {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.images.forEach(img => img.texture.dispose());
        this.images.clear();
        this.composer.dispose();
    }
}

export default LayerComposer;
