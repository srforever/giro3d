import {
    MathUtils,
    Mesh,
    Texture,
    Vector2,
    WebGLRenderer,
    WebGLRenderTarget,
} from 'three';
import Extent from '../geographic/Extent.js';
import Interpretation, { Mode } from './Interpretation.js';
import WebGLComposer from '../../renderer/composition/WebGLComposer.js';
import Rect from '../Rect.js';
import MemoryTracker from '../../renderer/MemoryTracker.js';
import ComposerTileMaterial from '../../renderer/composition/ComposerTileMaterial.js';
import TextureGenerator from '../../utils/TextureGenerator.js';

const tmpVec2 = new Vector2();

/**
 * Removes the texture data from CPU memory.
 * Important: this should only be done **after** the texture has been uploaded to the GPU.
 *
 * @param {Texture} texture The texture to purge.
 */
function onTextureUploaded(texture) {
    if (texture.isDataTexture) {
        texture.image.data = null;
    } else if (texture.isCanvasTexture) {
        texture.source.data = null;
    }
}

/**
 * @param {Texture} texture The texture to process.
 * @param {object} options Options.
 * @param {Interpretation} options.interpretation The interpretation.
 * @param {number} options.noDataValue The no-data value.
 */
function processMinMax(texture, { interpretation, noDataValue }) {
    if (texture.min != null && texture.max != null) {
        return { min: texture.min, max: texture.max };
    }

    if (texture.isDataTexture) {
        return TextureGenerator.computeMinMax(texture.image.data, noDataValue, interpretation);
    }
    if (texture.isCanvasTexture) {
        return TextureGenerator.computeMinMaxFromImage(texture.image, interpretation);
    }

    throw new Error('no min/max could be computed from texture');
}

/**
 * @enum
 */
const State = {
    /**
     * The image was not used at all during this render cycle.
     */
    NotUsed: 0,
    /**
     * The image was used this cycle for at least one render.
     */
    Used: 1,
};

class Image {
    constructor(options) {
        /** @type {string} */
        this.id = options.id;
        /** @type {Mesh} */
        this.mesh = options.mesh;
        /** @type {State} */
        this.state = State.NotUsed;
        /** @type {number} */
        this.lastUsed = performance.now();
        /** @type {Extent} */
        this.extent = options.extent;
        /** @type {Texture} */
        this.texture = options.texture;
        /** @type {boolean} */
        this.alwaysVisible = options.alwaysVisible ?? false;
        /** @type {ComposerTileMaterial} */
        this.material = this.mesh.material;
        /** @type {number} */
        this.min = options.min;
        /** @type {number} */
        this.max = options.max;
        /** @type {number} */
        this.resolution = this.extent.dimensions(tmpVec2).x / this.texture.image.width;
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

    update(now) {
        return this.material.update(now);
    }

    isFinished() {
        return !this.material.isAnimating();
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
    /**
     * @param {object} options The options.
     * @param {WebGLRenderer} options.renderer The WebGLRenderer.
     * @param {number} options.fadeDuration The duration of the fade-in of new images (ms).
     * @param {boolean} options.computeMinMax Compute min/max on generated images.
     * @param {boolean} options.transparent Enables transparency.
     * @param {number} options.noDataValue The no-data value.
     */
    constructor(options) {
        this.computeMinMax = options.computeMinMax;
        this.fadeDuration = options.fadeDuration;
        this.extent = options.extent;
        this.dimensions = this.extent ? this.extent.dimensions() : null;
        /** @type {Map<string, Image>} */
        this.images = new Map();
        this.webGLRenderer = options.renderer;
        this.transparent = options.transparent;
        this.noDataValue = options.noDataValue;

        delete options.computeMinMax;
        delete options.extent;

        /** @type {WebGLComposer} */
        this.composer = new WebGLComposer({
            webGLRenderer: options.renderer,
            extent: this.extent ? Rect.fromExtent(this.extent) : null,
            ...options,
        });

        this.disposed = false;
        this.now = performance.now();
        this.needsCleanup = false;
    }

    /**
     * Prevents the specified image from being removed during the cleanup step.
     *
     * @param {string} id The image ID to lock.
     * @param {number} nodeId The node id.
     */
    lock(id, nodeId) {
        const img = this.images.get(id);
        if (img) {
            img.owners.add(nodeId);
        }
    }

    /**
     * Allows the specified images to be removed during the cleanup step.
     *
     * @param {Set<string>} ids The image id to unlock.
     * @param {number} nodeId The node id.
     */
    unlock(ids, nodeId) {
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
     * Computes the z-order of the extent. Smaller extents have higher z-order.
     *
     * @param {Extent} extent The extent.
     */
    computeZOrder(extent) {
        if (this.dimensions) {
            const width = extent.dimensions(tmpVec2).x;
            const SMALLEST_WIDTH = this.dimensions.x / 33554432;
            return MathUtils.mapLinear(width, this.dimensions.x, SMALLEST_WIDTH, 0, 9);
        }

        return 0;
    }

    preprocessImage(extent, texture, options) {
        const rect = Rect.fromExtent(extent);
        const comp = new WebGLComposer({
            extent: rect,
            width: texture.image.width,
            height: texture.image.height,
            webGLRenderer: this.webGLRenderer,
        });

        comp.draw(texture, rect, {
            fillNoData: options.fillNoData,
            interpretation: options.interpretation,
            flipY: options.flipY,
            transparent: this.transparent,
        });

        delete options.fillNoData;
        delete options.flipY;
        delete options.interpretation;

        const result = comp.render();
        result.name = 'LayerComposer - temporary';

        result.min = texture.min;
        result.max = texture.max;

        comp.dispose();
        texture.dispose();

        return result;
    }

    /**
     * Adds a texture into the composer space.
     *
     * @param {object} options opts
     * @param {Texture} options.texture The texture.
     * @param {Extent} options.extent The geographic extent of the texture.
     * @param {boolean} [options.flipY] Flip the image vertically.
     * @param {Interpretation} [options.interpretation=Interpretation.Raw] The pixel interpretation.
     * @param {boolean} [options.fillNoData] Fill no-data values of the image.
     * @param {boolean} [options.alwaysVisible] Force constant visibility of this image.
     */
    add(options) {
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
            const { min, max } = processMinMax(actualTexture, options);
            options.min = min;
            options.max = max;
        }

        // If the image needs some preprocessing, let's do it now
        if (options.fillNoData || options.interpretation?.mode !== Mode.Raw) {
            actualTexture = this.preprocessImage(extent, texture, options);
        }

        options.zOrder = this.computeZOrder(extent);
        if (!options.alwaysVisible && this.transparent) {
            options.fadeDuration = this.fadeDuration;
        }

        const mesh = this.composer.draw(actualTexture, Rect.fromExtent(extent), {
            transparent: this.transparent,
            ...options,
        });

        if (MemoryTracker.enable) {
            MemoryTracker.track(actualTexture, `LayerComposer - texture ${id}`);
        }

        // Register a handler to be notified when the texture has been uploaded to the GPU
        // so that we can reclaim the texture data and free memory.
        texture.onUpdate = onTextureUploaded;

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
     * @param {string} imageId The image ID.
     * @returns {boolean} True if the composer contains the image.
     */
    has(imageId) {
        return this.images.has(imageId);
    }

    /**
     * Copies the source texture into the destination texture, taking into account the extent
     * of both textures.
     *
     * @param {object} options Options.
     * @param {Extent} options.sourceExtent The extent of the source texture.
     * @param {Extent} options.targetExtent The extent of the destination texture.
     * @param {{ texture: Texture, extent: Extent }[]} options.source The source render targets.
     * @param {WebGLRenderTarget} options.dest The destination render target.
     */
    copy(options) {
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

        target.texture.min = min;
        target.texture.max = max;

        for (const mesh of meshes) {
            this.composer.remove(mesh);
        }
    }

    /**
     * Clears the target texture.
     *
     * @param {object} options The options.
     * @param {Extent} options.extent The geographic extent of the region.
     * @param {number} options.width The width, in pixels of the target texture.
     * @param {number} options.height The height, in pixels of the target texture.
     * @param {boolean} options.clear Clears the target texture.
     * @param {WebGLRenderTarget} options.target The optional render target.
     */
    clearTexture(options) {
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
     * @param {Extent} extent The extent.
     */
    getMinMax(extent) {
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
     * @param {object} options The options.
     * @param {Extent} options.extent The geographic extent of the region.
     * @param {number} options.width The width, in pixels of the target texture.
     * @param {number} options.height The height, in pixels of the target texture.
     * @param {boolean} options.clear Clears the target texture.
     * @param {Set} options.imageIds The image ids to render.
     * @param {boolean} options.isFallbackMode Fallback mode.
     * @param {WebGLRenderTarget} options.target The optional render target.
     */
    render(options) {
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
        let isFallbackMode = options.isFallbackMode ?? !allImagesReady;

        for (const image of this.images.values()) {
            const isRequired = imageIds.has(image.id);
            if (isRequired && !image.isFinished()) {
                isFallbackMode = true;
            }
        }

        // Is this render the last one to do for this request,
        // or will we need more renders in the future ?
        let isLastRender = !isFallbackMode;

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
                if (isRequired && !image.isFinished()) {
                    // We may have all required images, but they may not
                    // be finished rendering (opacity animation)
                    isLastRender = false;
                }
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
        });

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

        let needsUpdate = false;

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

            const isFinished = image.isFinished();
            image.update(this.now);
            needsUpdate = needsUpdate || !isFinished;
        }

        return needsUpdate;
    }

    cleanup() {
        // Delete eligible images.
        for (const img of [...this.images.values()]) {
            if (img.canBeDeleted()) {
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
