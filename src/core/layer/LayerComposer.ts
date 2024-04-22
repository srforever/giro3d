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
    type PixelFormat,
    type TextureDataType,
} from 'three';
import type Extent from '../geographic/Extent';
import Interpretation from './Interpretation';
import WebGLComposer, { type DrawOptions } from '../../renderer/composition/WebGLComposer';
import Rect from '../Rect';
import MemoryTracker from '../../renderer/MemoryTracker';
import TextureGenerator from '../../utils/TextureGenerator';
import ProjUtils from '../../utils/ProjUtils';
import type MemoryUsage from '../MemoryUsage';
import {
    createEmptyReport,
    type GetMemoryUsageContext,
    type MemoryUsageReport,
} from '../MemoryUsage';

const tmpVec1 = new Vector2();
const tmpVec2 = new Vector2();
const DEFAULT_WARP_SUBDIVISIONS = 8;
const tmpFloat64 = new Float64Array(DEFAULT_WARP_SUBDIVISIONS * DEFAULT_WARP_SUBDIVISIONS * 3);

/**
 * Removes the texture data from CPU memory.
 * Important: this should only be done **after** the texture has been uploaded to the GPU.
 *
 * @param texture - The texture to purge.
 */
function onTextureUploaded(texture: Texture) {
    // The texture is empty.
    if (!texture.image) {
        return;
    }

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
 * @param texture - The texture to process.
 * @param options - Options.
 */
function processMinMax(
    texture: TextureWithMinMax,
    {
        interpretation,
        noDataValue,
    }: {
        /**  The interpretation. */
        interpretation: Interpretation;
        /** The no-data value. */
        noDataValue: number;
    },
) {
    if (texture.min != null && texture.max != null) {
        return { min: texture.min, max: texture.max };
    }

    const result = TextureGenerator.computeMinMax(texture, noDataValue, interpretation);

    if (!result) {
        throw new Error('no min/max could be computed from texture');
    } else {
        return result;
    }
}

class Image implements MemoryUsage {
    readonly id: string;
    readonly mesh: Mesh;
    readonly extent: Extent;
    readonly texture: Texture;
    readonly alwaysVisible: boolean;
    readonly material: Material;
    readonly min: number;
    readonly max: number;
    disposed: boolean;
    readonly owners: Set<number>;

    getMemoryUsage(context: GetMemoryUsageContext, target?: MemoryUsageReport) {
        return TextureGenerator.getMemoryUsage(this.texture, context, target);
    }

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

class LayerComposer implements MemoryUsage {
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
    readonly fillNoDataAlphaReplacement: number;
    readonly fillNoData: boolean;
    readonly fillNoDataRadius: number;
    readonly pixelFormat: PixelFormat;
    readonly textureDataType: TextureDataType;

    private _needsCleanup: boolean;

    disposed: boolean;

    getMemoryUsage(context: GetMemoryUsageContext, target?: MemoryUsageReport): MemoryUsageReport {
        const result = target ?? createEmptyReport();

        this.images.forEach(img => img.getMemoryUsage(context, target));

        return result;
    }

    /**
     * @param options - The options.
     */
    constructor(options: {
        /** The WebGLRenderer. */
        renderer: WebGLRenderer;
        /** Compute min/max on generated images. */
        computeMinMax: boolean;
        /** Enables transparency. */
        transparent?: boolean;
        /** The no-data value. */
        noDataValue?: number;
        /** The CRS of the source. */
        sourceCrs: string;
        /** The extent. */
        extent: Extent;
        /** Show image outlines. */
        showImageOutlines: boolean;
        /** The target CRS of this composer. */
        targetCrs: string;
        /** The interpretation of the layer. */
        interpretation: Interpretation;
        /** Fill no-data values of the image. */
        fillNoData: boolean;
        /** Alpha value for no-data pixels (after replacement) */
        fillNoDataAlphaReplacement: number;
        /** Fill no-data maximum radius. */
        fillNoDataRadius: number;
        /**  The pixel format of the output textures. */
        pixelFormat: PixelFormat;
        /** The type of the output textures. */
        textureDataType: TextureDataType;
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
        this.fillNoData = options.fillNoData;
        this.fillNoDataAlphaReplacement = options.fillNoDataAlphaReplacement;
        this.fillNoDataRadius = options.fillNoDataRadius;
        this.pixelFormat = options.pixelFormat;
        this.textureDataType = options.textureDataType;

        this.composer = new WebGLComposer({
            webGLRenderer: options.renderer,
            extent: this.extent ? Rect.fromExtent(this.extent) : null,
            showImageOutlines: options.showImageOutlines,
            pixelFormat: options.pixelFormat,
            textureDataType: options.textureDataType,
        });

        this.disposed = false;
        this._needsCleanup = false;
    }

    /**
     * Prevents the specified image from being removed during the cleanup step.
     *
     * @param id - The image ID to lock.
     * @param nodeId - The node id.
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
     * @param ids - The image id to unlock.
     * @param nodeId - The node id.
     */
    unlock(ids: Set<string>, nodeId: number) {
        ids.forEach(id => {
            const image = this.images.get(id);
            if (image) {
                image.owners.delete(nodeId);
                if (image.owners.size === 0) {
                    this._needsCleanup = true;
                }
            }
        });
    }

    /**
     * Computes the distance between the composition camera and the image.
     *
     * Smaller images will be closer to the camera.
     *
     * @param extent - The extent.
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

    private preprocessImage(
        extent: Extent,
        texture: TextureWithMinMax,
        options: {
            fillNoData: boolean;
            interpretation: Interpretation;
            flipY: boolean;
            fillNoDataAlphaReplacement: number;
            fillNoDataRadius: number;
            outputType: TextureDataType;
            target?: WebGLRenderTarget<Texture>;
            expandRGB?: boolean;
        },
    ) {
        const rect = Rect.fromExtent(extent);
        const comp = new WebGLComposer({
            extent: rect,
            width: texture.image.width,
            height: texture.image.height,
            webGLRenderer: this.webGLRenderer,
            textureDataType: options.outputType,
            pixelFormat: this.pixelFormat,
            expandRGB: options.expandRGB ?? false,
        });

        // The fill no-data radius is expressed in CRS units in the API,
        // but in UV space in the shader. A conversion is necessary.
        let noDataRadiusInUVSpace = 1; // Default is no limit.
        if (options.fillNoData && Number.isFinite(options.fillNoDataRadius)) {
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

        const result = comp.render({
            target: options.target,
        }) as TextureWithMinMax;
        result.name = 'LayerComposer - image (preprocessed)';

        result.min = texture.min;
        result.max = texture.max;

        comp.dispose();
        texture.dispose();

        return result;
    }

    /**
     * Creates a lattice mesh whose each vertex has been warped to the target CRS.
     *
     * @param sourceExtent - The source extent of the mesh to reproject, in the CRS of the source.
     * @param segments - The number of subdivisions of the lattice.
     * A high value will create more faithful reprojections, at the cost of performance.
     */
    private createWarpedMesh(sourceExtent: Extent, segments: number = DEFAULT_WARP_SUBDIVISIONS) {
        const dims = sourceExtent.dimensions(tmpVec1);
        // Vector3
        const itemSize = 3;
        const arraySize = (segments + 1) * (segments + 1) * itemSize;
        const float64 = tmpFloat64.length === arraySize ? tmpFloat64 : new Float64Array(arraySize);
        const grid = sourceExtent.toGrid(segments, segments, float64, itemSize);
        const targetExtent = sourceExtent.as(this.targetCrs);
        const center = targetExtent.centerAsVector2(tmpVec2);

        // Transformations must occur in double precision
        ProjUtils.transformBufferInPlace(grid, {
            srcCrs: this.sourceCrs,
            dstCrs: this.targetCrs,
            offset: new Vector2(-center.x, -center.y),
            stride: itemSize,
        });

        const geometry = new PlaneGeometry(dims.x, dims.y, segments, segments);
        const positionAttribute = geometry.getAttribute('position');

        // But vertex buffers are in single precision.
        const float32 = positionAttribute.array;

        for (let i = 0; i < float64.length; i++) {
            float32[i] = float64[i];
        }

        positionAttribute.needsUpdate = true;
        geometry.computeBoundingBox();

        // Note: the material will be set by the WebGLComposer itself.
        const result = new Mesh(geometry);
        result.position.set(center.x, center.y, 0);
        result.updateMatrixWorld();

        return result;
    }

    /**
     * Adds a texture into the composer space.
     *
     * @param options - opts
     */
    add(options: {
        /** The image ID. */
        id: string;
        /** The texture. */
        texture: Texture;
        /** The geographic extent of the texture. */
        extent: Extent;
        /** Flip the image vertically. */
        flipY?: boolean;
        /** The min value of the texture. */
        min?: number;
        /** The max value of the texture. */
        max?: number;
        /** Force constant visibility of this image. */
        alwaysVisible?: boolean;
    }) {
        const { extent, texture, id } = options;

        if (this.images.has(id)) {
            // We already have this image.
            return;
        }

        if (texture == null) {
            throw new Error(
                'texture cannot be null. Use an empty texture instead. (i.e new Texture())',
            );
        }

        let actualTexture = texture;

        // The texture might be an empty texture, appearing completely transparent.
        // Since is has no data, it cannot be preprocessed.
        if (texture.image) {
            if (this.computeMinMax && options.min == null && options.max == null) {
                const { min, max } = processMinMax(actualTexture, {
                    interpretation: this.interpretation,
                    noDataValue: this.noDataValue,
                });
                options.min = min;
                options.max = max;
            }

            const expandRGB = TextureGenerator.shouldExpandRGB(
                texture.format as PixelFormat,
                this.pixelFormat,
            );

            // If the image needs some preprocessing, let's do it now
            if (expandRGB || options.flipY || !this.interpretation.isDefault()) {
                actualTexture = this.preprocessImage(extent, texture, {
                    fillNoData: false,
                    flipY: options.flipY,
                    interpretation: this.interpretation,
                    fillNoDataAlphaReplacement: 0,
                    fillNoDataRadius: 0,
                    expandRGB,
                    outputType: this.textureDataType,
                });
            }
        }

        let mesh;
        const composerOptions: DrawOptions = {
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

        const memoryUsage: MemoryUsageReport = TextureGenerator.getMemoryUsage(texture, {
            renderer: this.webGLRenderer,
        });
        // Since we are deleting the CPU-side data.
        memoryUsage.cpuMemory = 0;
        actualTexture.userData.memoryUsage = memoryUsage;

        // Register a handler to be notified when the original texture has
        // been uploaded to the GPU so that we can reclaim the texture data and free memory.
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

        this._needsCleanup = true;
    }

    /**
     * Gets whether this composer contains the specified image.
     *
     * @param imageId - The image ID.
     * @returns True if the composer contains the image.
     */
    has(imageId: string): boolean {
        return this.images.has(imageId);
    }

    /**
     * Copies the source texture into the destination texture, taking into account the extent
     * of both textures.
     *
     * @param options - Options.
     */
    copy(options: {
        /** The extent of the destination texture. */
        targetExtent: Extent;
        /** The source render targets. */
        source: {
            texture: TextureWithMinMax;
            extent: Extent;
        }[];
        /** The destination render target. */
        dest: WebGLRenderTarget;
    }) {
        const targetExtent = options.targetExtent;
        const target = options.dest;

        const meshes = [];

        let min = +Infinity;
        let max = -Infinity;

        for (const { texture, extent } of options.source) {
            const sourceExtent = extent;

            const mesh = this.composer.draw(texture, Rect.fromExtent(sourceExtent));

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
     * @param options - The options.
     */
    clearTexture(options: {
        /** The geographic extent of the region. */
        extent: Extent;
        /** The width, in pixels of the target texture. */
        width: number;
        /** The height, in pixels of the target texture. */
        height: number;
        /** Clears the target texture. */
        clear: boolean;
        /** The optional render target. */
        target: WebGLRenderTarget;
    }) {
        const { extent, width, height, target } = options;

        this.images.forEach(img => {
            img.visible = false;
        });

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
     * @param extent - The extent.
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
     * @param options - The options.
     */
    render(options: {
        /** The geographic extent of the region. */
        extent: Extent;
        /** The width, in pixels of the target texture. */
        width: number;
        /** The height, in pixels of the target texture. */
        height: number;
        /** Clears the target texture. */
        clear?: boolean;
        /** The image ids to render. */
        imageIds: Set<string>;
        /** Fallback mode. */
        isFallbackMode?: boolean;
        /** The optional render target. */
        target: WebGLRenderTarget;
    }) {
        const { extent, width, height, target, imageIds } = options;

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

            const isInView = extent.intersectsExtent(image.extent) || image.alwaysVisible;

            image.visible = (isFallbackMode && isInView) || isRequired;

            // An image should be visible:
            // - if its is part of the required images,
            // - if no required images are available (fallback mode)
            if (image.visible) {
                image.opacity = 1;
            }

            if (this.computeMinMax && isRequired) {
                min = Math.min(image.min, min);
                max = Math.max(image.max, max);
            }
        }

        // We didn't have exact images for this request, so we will need to
        // compute an approximate minmax from existing images.
        if (
            this.computeMinMax &&
            isFallbackMode &&
            (!Number.isFinite(min) || !Number.isFinite(max))
        ) {
            for (const image of this.images.values()) {
                if (extent.intersectsExtent(image.extent)) {
                    min = Math.min(image.min, min);
                    max = Math.max(image.max, max);
                }
            }
        }

        // If some post-processing is required, we will render into a temporary texture,
        // otherwise we can directly render to the client's target.
        let texture = this.composer.render({
            width,
            height,
            rect: Rect.fromExtent(extent),
            target: this.fillNoData ? undefined : target,
        }) as TextureWithMinMax;

        texture.min = min;
        texture.max = max;

        // Apply nodata filling on the final texture. This was originally done as a pre-processing
        // step, but this would lead to artifacts in the case where the image is reprojected.
        if (this.fillNoData) {
            texture = this.processFillNoData(texture, extent, target);
        }

        return { texture, isLastRender };
    }

    private processFillNoData(
        texture: TextureWithMinMax,
        extent: Extent,
        target: WebGLRenderTarget<Texture>,
    ) {
        return this.preprocessImage(extent, texture, {
            fillNoData: this.fillNoData,
            fillNoDataAlphaReplacement: this.fillNoDataAlphaReplacement,
            fillNoDataRadius: this.fillNoDataRadius,
            flipY: false,
            interpretation: Interpretation.Raw,
            target,
            outputType: this.textureDataType,
        });
    }

    postUpdate() {
        if (this._needsCleanup) {
            this.cleanup();
            this._needsCleanup = false;
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
