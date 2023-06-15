/**
 * @module core/layer/Layer
 */
import {
    EventDispatcher,
    LinearFilter,
    MathUtils,
    Mesh,
    Object3D,
    RGBAFormat,
    Vector2,
    WebGLRenderTarget,
} from 'three';

import ColorMap from './ColorMap.js';
import Interpretation from './Interpretation.js';
import Extent from '../geographic/Extent.js';
import EventUtils from '../../utils/EventUtils.js';
import LayerComposer from './LayerComposer.js';
import PromiseUtils from '../../utils/PromiseUtils.js';
import MemoryTracker from '../../renderer/MemoryTracker.js';
import Instance from '../Instance.js';
import ImageSource from '../../sources/ImageSource.js';
import { DefaultQueue } from '../RequestQueue.js';
import OperationCounter from '../OperationCounter.js';

const POOL_SIZE = 16;
const CANCELLED_REGEXP = /cancelled|aborted/;
const tmpDims = new Vector2();

/**
 * @enum
 */
const TargetState = {
    Pending: 0,
    Processing: 1,
    Complete: 2,
    Disposed: 3,
};

class Target {
    constructor(options) {
        /** @type {Mesh} */
        this.node = options.node;
        this.pitch = options.pitch;
        /** @type {Extent} */
        this.extent = options.extent;
        this.width = options.width;
        this.height = options.height;
        /** @type {WebGLRenderTarget} */
        this.renderTarget = null;
        /** @type {Set} */
        this.imageIds = new Set();
        /** @type {AbortController} */
        this.controller = new AbortController();
        this.state = TargetState.Pending;
    }

    reset() {
        this.abort();
        this.state = TargetState.Pending;
        this.imageIds.clear();
    }

    abort() {
        this.controller.abort(new Error('cancelled'));
        this.controller = new AbortController();
    }
}

function shouldCancelRequest(node, layer) {
    if (layer.disposed) {
        return true;
    }

    if (node.disposed) {
        return true;
    }

    if (!node.parent || !node.material) {
        return true;
    }

    return !node.material.visible;
}

/**
 * Fires when layer visibility change
 *
 * @api
 * @event Layer#visible-property-changed
 * @property {object} new the new value of the property
 * @property {object} new.visible the new value of the layer visibility
 * @property {object} previous the previous value of the property
 * @property {object} previous.visible the previous value of the layer visibility
 * @property {Layer} target dispatched on layer
 * @property {string} type visible-property-changed
 */

/**
 * Base class of layers. Layers are components of {@link module:entities/Map~Map Maps} or any
 * compatible entity.
 *
 * The same layer can be added to multiple maps. Don't forget to call `dispose()` when the layer
 * should be destroyed, as removing a layer from a map will not release memory associated with the
 * layer (such as textures).
 *
 * A layer type can be either `color` (such as satellite imagery or maps),
 * or `elevation` (to describe terrain elevation).
 *
 * Layer is an abstract class. Use
 * {@link module:Core/layer/ColorLayer~ColorLayer ColorLayer} or
 * {@link module:Core/layer/ElevationLayer~ElevationLayer ElevationLayer} instead to create layers.
 *
 *     // Create a layer source
 *     var source = new TileWMS({options}); // use a source from OpenLayers
 *
 *     // Add and create a new Layer to a map.
 *     const newLayer = ColorLayer(
 *         'myColorLayerId', {
 *             source,
 *         }
 *     });
 *     map.addLayer(newLayer);
 *
 *     // Change layer's visibilty
 *     const layerToChange = map.getLayers(layer => layer.id === 'idLayerToChange')[0];
 *     layerToChange.visible = false;
 *     instance.notifyChange(); // update instance
 *
 *     // Change layer's opacity
 *     const layerToChange = map.getLayers(layer => layer.id === 'idLayerToChange')[0];
 *     layerToChange.opacity = 0.5;
 *     instance.notifyChange(); // update instance
 *
 *     // Listen to properties
 *     const layerToListen = map.getLayers(layer => layer.id === 'idLayerToListen')[0];
 *     layerToListen.addEventListener('visible-property-changed', (event) => console.log(event));
 *
 * @property {boolean} visible Whether this ColorLayer will be displayed on parent entity.
 * @property {boolean} frozen if true, updates on this layer will be inhibited. Useful for debugging
 * a certain state, as moving the camera won't trigger texture changes.
 * @api
 */
class Layer extends EventDispatcher {
    /**
     * Creates a layer.
     * It should be added in {@link module:entities/Map~Map Maps} to be displayed in the instance.
     * See the example for more information on layer creation.
     *
     * @param {string} id The unique identifier of the layer.
     * @param {object} options The layer options.
     * @param {ImageSource} options.source The data source of this layer.
     * @param {Extent} [options.extent] The optional extent of the layer. If defined, only parts
     * of the layers inside the extent will be displayed.
     * @param {Interpretation} [options.interpretation=Interpretation.Raw] How to interpret the
     * values in the dataset.
     * @param {string} [options.backgroundColor=undefined] The background color of the layer.
     * @param {boolean} [options.fillNoData=false] Enables or disables no-data filling for images.
     * @param {boolean} [options.computeMinMax=false] Computes min/max for images.
     * @param {ColorMap} [options.colorMap=undefined] An optional color map for this layer.
     */
    constructor(id, options) {
        super();
        if (id === undefined || id === null) {
            throw new Error('id is undefined');
        }

        Object.defineProperty(this, 'id', {
            value: id,
            writable: false,
        });

        // We need a globally unique ID for this layer, to avoid collisions in the request queue.
        // The "id" property is not globally unique (only unique within a given map).
        this.uuid = MathUtils.generateUUID();

        this.type = 'Layer';
        /** @type {Interpretation} */
        this.interpretation = options.interpretation ?? Interpretation.Raw;
        this.showTileBorders = options.showTileBorders ?? false;

        EventUtils.definePropertyWithChangeEvent(this, 'visible', true);
        this.frozen = false;

        this.fillNoData = options.fillNoData;
        this.fadeDuration = options.fadeDuration;
        this.computeMinMax = options.computeMinMax ?? false;

        if (options.colorMap !== undefined) {
            /** @type {ColorMap} */
            this.colorMap = options.colorMap;
        }

        /** @type {Extent} */
        this.extent = options.extent;
        /** @type {Map<string, Array<WebGLRenderTarget>>} */
        this.renderTargetPool = new Map();

        if (!options.source || !(options.source instanceof ImageSource)) {
            throw new Error('missing or invalid source');
        }
        /** @type {ImageSource} */
        this.source = options.source;

        this.source.addEventListener('updated', () => this.onSourceUpdated());

        this.backgroundColor = options.backgroundColor;

        /** @type {LayerComposer} */
        this.composer = null;

        /** @type {Map<number, Target>} */
        this.targets = new Map();

        // We only fetch images that we don't already have.
        this.filter = imageId => !this.composer.has(imageId);

        this.queue = DefaultQueue;

        this.shouldNotify = false;
        this.disposed = false;

        this.opCounter = new OperationCounter();
        this.initializing = false;
    }

    onSourceUpdated() {
        if (!this.ready) {
            return;
        }
        this.composer.clear();
        for (const target of this.targets.values()) {
            target.reset();
        }

        this._instance.notifyChange(this, true);
    }

    /**
     * Gets whether this layer is currently loading data.
     *
     * @api
     * @type {boolean}
     */
    get loading() {
        return this.opCounter.loading;
    }

    /**
     * Gets the progress value of the data loading.
     *
     * @api
     * @type {boolean}
     */
    get progress() {
        return this.opCounter.progress;
    }

    _preprocessLayer(instance) {
        if (this.initializing) {
            // Avoid preprocessing the layer multiple times.
            return this;
        }

        this.initializing = true;

        /** @type {Instance} */
        this._instance = instance;

        // Let's fetch a low resolution image to fill tiles until we have a better resolution.
        this.whenReady = this.prepare()
            .then(() => {
                this.ready = true;
                return this;
            });

        return this;
    }

    async prepare() {
        this.opCounter.increment();
        const targetProjection = this.extent?.crs() ?? this._instance.referenceCrs;
        await this.source.initialize({ targetProjection });

        this.composer = new LayerComposer({
            renderer: this._instance.renderer,
            extent: this.extent,
            fadeDuration: this.fadeDuration,
            computeMinMax: this.computeMinMax,
            showImageOutlines: this.showTileBorders,
            transparent: this.transparent,
        });

        await this.loadFallbackImages();

        await this.onInitialized();

        this._instance.notifyChange(this);
        this.opCounter.decrement();
    }

    /**
     * Returns the final extent of this layer. If this layer has its own extent defined,
     * this will be used.
     * Otherwise, will return the source extent (if any).
     *
     * @returns {Extent} The layer final extent.
     */
    getExtent() {
        // The layer extent takes precedence over the source extent,
        // since it maye be used for some cropping effect.
        return this.extent ?? this.source.getExtent();
    }

    async loadFallbackImages() {
        const extent = this.getExtent();

        // If neither the source nor the layer are able to provide an extent,
        // we cannot reliably fetch fallback images.
        if (!extent) {
            return;
        }
        const width = 512;
        const dims = extent.dimensions();
        const height = width * (dims.y / dims.x);

        const requests = this.source.getImages({
            id: 'background',
            extent,
            width,
            height,
        });

        const promises = requests.map(img => img.request());

        const results = await Promise.allSettled(promises);

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const image = result.value;

                const opts = {
                    interpretation: this.interpretation,
                    fillNoData: this.fillNoData,
                    alwaysVisible: true, // Ensures background images are never deleted
                    flipY: this.source.flipY,
                    noDataValue: this.noDataValue,
                    ...image,
                };
                this.composer.add(opts);
            }
        }
    }

    /**
     * Called when the layer has finished initializing.
     */
    // eslint-disable-next-line class-methods-use-this
    async onInitialized() {
        // Implemented in derived classes.
    }

    /**
     * @param {object} options Options.
     * @param {Extent} options.extent The request extent.
     * @param {number} options.width The request width, in pixels.
     * @param {number} options.height The request height, in pixels.
     * @param {AbortSignal} options.signal The abort signal.
     * @param {Set} options.imageIds The image ids for this request.
     * @param {boolean} options.alwaysVisible If true, the image is always visible on the canvas.
     * @param {Object3D} options.node The node associated with this request.
     * @returns {Promise} A promise that is settled when all images have been fetched.
     */
    async fetchImages({
        node,
        extent,
        width,
        height,
        signal,
        imageIds,
        alwaysVisible,
    }) {
        // Let's wait for a short time to avoid processing requests that become
        // immediately obsolete, such as tiles that become visible for a very brief moment.
        // Those tiles will be rendered using whatever data is available in the composer.
        await PromiseUtils.delay(200);

        if (shouldCancelRequest(node, this)) {
            throw new Error('cancelled');
        }

        const results = this.source.getImages({
            id: `${node.id}`,
            extent,
            width,
            height,
            signal,
        });

        if (results.length === 0) {
            // No new image to generate
            return;
        }

        // Register the ids on the tile
        results.forEach(r => {
            imageIds.add(r.id);
        });

        if (shouldCancelRequest(node, this)) {
            throw new Error('cancelled');
        }

        const allImages = [];

        for (const { id, request } of results) {
            if (!request || this.composer.has(id)) {
                continue;
            }

            // More recent requests should be served first.
            const priority = performance.now();
            const shouldExecute = () => this.filter(id);

            this.opCounter.increment();

            const requestId = `${this.uuid}-${id}`;

            const p = this.queue.enqueue({
                id: requestId, request, priority, shouldExecute,
            }).then(image => {
                if (!this.disposed) {
                    const opts = {
                        interpretation: this.interpretation,
                        fillNoData: this.fillNoData,
                        alwaysVisible,
                        flipY: this.source.flipY,
                        ...image,
                    };

                    this.composer.add(opts);
                    if (!shouldCancelRequest(node, this)) {
                        this.composer.lock(id, node.id);
                    }
                }
            }).finally(() => {
                this.opCounter.decrement();
            });

            allImages.push(p);
        }

        await Promise.allSettled(allImages);
    }

    /**
     * Removes the node from this layer.
     *
     * @param {Object3D} node The disposed node.
     */
    unregisterNode(node) {
        const id = node.id;
        if (this.targets.has(id)) {
            const target = this.targets.get(id);
            this.releaseRenderTarget(target.renderTarget);
            this.targets.delete(id);
            this.composer.unlock(target.imageIds, id);
            target.state = TargetState.Disposed;
            target.abort();
        }
    }

    repaintAllTargets() {
        for (const target of this.targets.values()) {
            target.reset();
            this.paintTarget(target);
        }

        this._instance.notifyChange(this);
    }

    // eslint-disable-next-line class-methods-use-this
    adjustExtent(extent) {
        return extent;
    }

    /**
     * Adjusts the extent to avoid visual artifacts.
     *
     * @param {Extent} originalExtent The original extent.
     * @param {number} originalWidth The width, in pixels, of the original extent.
     * @param {number} originalHeight The height, in pixels, of the original extent.
     * @returns {{extent: Extent, width: number, height: number }} And object containing the
     * adjusted extent, as well as adjusted pixel size.
     */
    // eslint-disable-next-line class-methods-use-this
    adjustExtentAndPixelSize(originalExtent, originalWidth, originalHeight) {
        // Let's ask the source if it can help us have a pixel-perfect extent
        const sourceAdjusted = this.source.adjustExtentAndPixelSize(
            originalExtent,
            originalWidth,
            originalHeight,
            2,
        );

        if (sourceAdjusted
            && sourceAdjusted.width <= originalWidth
            && sourceAdjusted.height <= originalHeight) {
            return sourceAdjusted;
        }

        // Tough luck, the source does not implement this feature. Let's use a default
        // implementation: add a 5% margin to eliminate visual artifacts at the edges of tiles,
        // such as color bleeding in atlas textures and hillshading issues with elevation data.
        const margin = 0.05;
        const pixelMargin = 4;
        const marginExtent = originalExtent
            .withRelativeMargin(margin);

        // Should we crop the extent ?
        const adjustedExtent = this.adjustExtent(marginExtent);
        const width = originalWidth + pixelMargin * 2;
        const height = originalHeight + pixelMargin * 2;

        return { extent: adjustedExtent, width, height };
    }

    /**
     * @param {Target} target The target.
     * @returns {Target} The smallest target that still contains this extent.
     */
    getParent(target) {
        const extent = target.extent;
        /** @type {Array<Target>} */
        const targets = Array.from(this.targets.values()).sort((a, b) => {
            const ax = a.extent.dimensions(tmpDims).x;
            const bx = b.extent.dimensions(tmpDims).x;
            return ax - bx;
        });
        for (const t of targets) {
            if (extent.isInside(t.extent) && t.state === TargetState.Complete) {
                return t;
            }
        }

        return null;
    }

    /**
     * @param {Target} target The target.
     */
    applyDefaultTexture(target) {
        const parent = this.getParent(target);

        if (parent) {
            const img = { texture: parent.renderTarget.texture, extent: parent.extent };

            // Inherit parent's texture by copying the data of the parent into the child.
            this.composer.copy({
                source: [img],
                dest: target.renderTarget,
                targetExtent: target.extent,
            });
        } else {
            // We didn't find any parent nor child, use whatever is present in the composer.
            this.composer.render({
                extent: target.extent,
                width: target.width,
                height: target.height,
                target: target.renderTarget,
                imageIds: target.imageIds,
                isFallbackMode: true,
            });
        }

        const texture = target.renderTarget.texture;
        this.applyTextureToNode({ texture, pitch: target.pitch }, target.node, false);
        this._instance.notifyChange(this);
    }

    /**
     * Processes the target once, fetching all images relevant for this target,
     * then paints those images to the target's texture.
     *
     * @param {Target} target The target to paint.
     */
    processTarget(target) {
        if (target.state !== TargetState.Pending) {
            return;
        }

        target.state = TargetState.Processing;
        const signal = target.controller.signal;

        if (signal.aborted) {
            target.state = TargetState.Pending;
            return;
        }

        const extent = target.extent;
        const node = target.node;
        const width = target.width;
        const height = target.height;
        const pitch = target.pitch;

        if (!target.renderTarget) {
            target.renderTarget = this.acquireRenderTarget(width, height);

            this.applyDefaultTexture(target);
        }

        // Fetch adequate images from the source...
        const isContained = this.contains(extent);
        if (isContained) {
            const imageIds = target.imageIds;

            this.fetchImages({
                extent, width, height, signal, imageIds, node,
            }).then(() => {
                if (target.state === TargetState.Disposed) {
                    return;
                }

                const { isLastRender } = this.composer.render({
                    extent,
                    width,
                    height,
                    target: target.renderTarget,
                    imageIds: target.imageIds,
                });

                if (isLastRender) {
                    target.state = TargetState.Complete;
                }

                const texture = target.renderTarget.texture;
                this.applyTextureToNode({ texture, pitch }, node, isLastRender);
                this._instance.notifyChange(this);
            }).catch(err => {
                if (!CANCELLED_REGEXP.test(err.message)) {
                    console.error(err);
                }
                target.state = TargetState.Pending;
            });
        } else {
            // The target is not contained within the source: clear the texture so it appears empty.
            // This ensures that residual pixels coming from inherited textures are removed.
            this.composer.clearTexture({
                extent,
                width,
                height,
                target: target.renderTarget,
            });
            const texture = target.renderTarget.texture;
            this.applyTextureToNode({ texture, pitch }, node, true);
        }
    }

    /**
     * Updates the provided node with content from this layer.
     *
     * @param {module:Core/Context~Context} context the context
     * @param {Object3D} node the node to update
     * @param {module:entities/Map~Map} parent the map where the layers have been added
     * @param {boolean} [initOnly = false] if true, the update is stopped before the update command
     * there is only a check that the layer state is defined in the node.
     * @returns {null|Promise} null if the update is not done,
     * else, that succeeds if the update is made. Currently, only null is returned
     * since the method is empty.
     */
    // eslint-disable-next-line
    update(context, node, parent, initOnly = false) {
        if (this.disposed) {
            throw new Error('the layer is disposed');
        }

        if (!this.ready) {
            return null;
        }

        const { material } = node;

        if (!node.parent || !material) {
            return null;
        }

        // Node is hidden, no need to update it
        if (!node.material.visible || initOnly) {
            return null;
        }

        /** @type {Target} */
        let target;

        // First time we encounter this node
        if (!this.targets.has(node.id)) {
            const originalExtent = node.getExtent().clone();
            const textureSize = node.textureSize;
            // The texture that will be painted onto this node will not have the exact extent of
            // this node, to avoid problems caused by pixels sitting on the edge of the tile.
            const { extent, width, height } = this.adjustExtentAndPixelSize(
                originalExtent,
                textureSize.x,
                textureSize.y,
            );
            const pitch = originalExtent.offsetToParent(extent);

            target = new Target({
                node, extent, pitch, width, height,
            });
            this.targets.set(node.id, target);

            this.registerNode(node, extent);

            // Since the node does not own the texture for this layer, we need to be
            // notified whenever it is disposed so we can in turn dispose the texture.
            node.addEventListener('dispose', () => this.unregisterNode(node));
        } else {
            target = this.targets.get(node.id);
        }

        this.updateMaterial(material);

        // An update is pending / or impossible -> abort
        if (this.frozen || !this.visible) {
            return null;
        }

        // Repaint the target if necessary.
        this.processTarget(target);
    }

    contains(extent) {
        const thisExtent = this.getExtent();
        if (thisExtent) {
            return this.getExtent().intersectsExtent(extent);
        }
        // We don't have any extent available (neither layer nor source),
        // so we cannot know.
        return true;
    }

    getRenderTargetDataType() {
        return this.source.datatype;
    }

    /**
     * @param {WebGLRenderTarget} target The render target to release.
     */
    releaseRenderTarget(target) {
        if (!target) {
            return;
        }
        const width = target.width;
        const height = target.height;
        const key = `${width}${height}`;
        const pool = this.renderTargetPool.get(key);
        if (pool && pool.length < POOL_SIZE) {
            pool.push(target);
        } else {
            target.dispose();
        }
    }

    /**
     * @param {number} width Width
     * @param {number} height Height
     * @returns {WebGLRenderTarget} The render target.
     */
    acquireRenderTarget(width, height) {
        const type = this.getRenderTargetDataType();

        const key = `${width}${height}`;

        /** @type {Array<WebGLRenderTarget>} */
        let pool;

        if (!this.renderTargetPool.has(key)) {
            pool = [];
            this.renderTargetPool.set(key, pool);
        } else {
            pool = this.renderTargetPool.get(key);
        }

        if (pool.length > 0) {
            return pool.pop();
        }

        const result = new WebGLRenderTarget(
            width,
            height, {
                format: RGBAFormat,
                magFilter: LinearFilter,
                minFilter: LinearFilter,
                type,
                depthBuffer: true,
                generateMipmaps: false,
            },
        );

        result.texture.name = `Layer "${this.id} - WebGLRenderTarget`;

        MemoryTracker.track(result, `Layer "${this.id} - WebGLRenderTarget`);
        return result;
    }

    postUpdate() {
        if (this.disposed) {
            throw new Error('the layer is disposed');
        }

        if (this.composer?.postUpdate() || this.shouldNotify) {
            this._instance.notifyChange(this);
        }
        this.shouldNotify = false;
    }

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    updateMaterial(material) {
        // Implemented in derived classes
    }

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    registerNode(node, extent) {
        // Implemented in derived classes
    }

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    applyTextureToNode(texture, node, isLastRender) {
        // Implemented in derived classes
    }

    /**
     * Disposes the layer. This releases all resources held by this layer.
     *
     * @api
     */
    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.renderTargetPool.forEach(pool => pool.forEach(t => t.dispose()));
        this.renderTargetPool.clear();
        this.source.dispose();
        this.composer?.dispose();
        for (const target of this.targets.values()) {
            target.abort();
            this.unregisterNode(target.node);
            target.renderTarget?.dispose();
        }
    }
}

export default Layer;
