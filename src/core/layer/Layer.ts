import {
    Color,
    ColorRepresentation,
    EventDispatcher,
    LinearFilter,
    Material,
    MathUtils,
    RGBAFormat,
    Texture,
    Vector2,
    WebGLRenderTarget,
} from 'three';

import ColorMap from './ColorMap.js';
import Interpretation from './Interpretation.js';
import Extent from '../geographic/Extent.js';
import EventUtils from '../../utils/EventUtils.js';
import LayerComposer from './LayerComposer.js';
import PromiseUtils, { PromiseStatus } from '../../utils/PromiseUtils.js';
import MemoryTracker from '../../renderer/MemoryTracker.js';
import Instance from '../Instance.js';
import ImageSource, { ImageResult } from '../../sources/ImageSource.js';
import RequestQueue, { DefaultQueue } from '../RequestQueue';
import OperationCounter from '../OperationCounter';
import TileMesh from '../TileMesh.js';
import PointCloud from '../PointCloud.js';
import Context from '../Context.js';
import LayeredMaterial from '../../renderer/LayeredMaterial.js';
import PointsMaterial from '../../renderer/PointsMaterial.js';
import Progress from '../Progress.js';

export interface TextureAndPitch {
    texture: Texture
    pitch: Vector2;
}

const POOL_SIZE = 16;
const tmpDims = new Vector2();

export type Node = TileMesh | PointCloud;

export type NodeMaterial = LayeredMaterial | PointsMaterial;

enum TargetState {
    Pending = 0,
    Processing = 1,
    Complete = 2,
    Disposed = 3,
}

class Target {
    node: Node;
    pitch: Vector2;
    extent: Extent;
    width: number;
    height: number;
    renderTarget: WebGLRenderTarget;
    imageIds: Set<string>;
    controller: AbortController;
    state: TargetState;

    constructor(options: {
        node: Node;
        extent: Extent;
        pitch: Vector2;
        width: number;
        height: number;
    }) {
        this.node = options.node;
        this.pitch = options.pitch;
        this.extent = options.extent;
        this.width = options.width;
        this.height = options.height;
        this.imageIds = new Set();
        this.controller = new AbortController();
        this.state = TargetState.Pending;
    }

    reset() {
        this.abort();
        this.state = TargetState.Pending;
        this.imageIds.clear();
    }

    abort() {
        this.controller.abort(PromiseUtils.abortError());
        this.controller = new AbortController();
    }

    abortAndThrow() {
        const signal = this.controller.signal;
        this.abort();
        signal.throwIfAborted();
    }
}

/**
 * Fires when layer visibility change
 *
 * @event Layer#visible-property-changed
 * @property {object} new the new value of the property
 * @property {object} new.visible the new value of the layer visibility
 * @property {object} previous the previous value of the property
 * @property {object} previous.visible the previous value of the layer visibility
 * @property {Layer} target dispatched on layer
 * @property {string} type visible-property-changed
 */

/**
 * Base class of layers. Layers are components of maps or any compatible entity.
 *
 * The same layer can be added to multiple entities. Don't forget to call {@link dispose} when the
 * layer should be destroyed, as removing a layer from an entity will not release memory associated
 * with the layer (such as textures).
 *
 * ## Types of layers
 *
 * `Layer` is an abstract class. See subclasses for specific information. Main subclasses:
 *
 * - `ColorLayer` for color information, such as satellite imagery, vector data, etc.
 * - `ElevationLayer` for elevation and terrain data.
 * - `MaskLayer`: a special kind of layer that applies a mask on its host map.
 *
 * ## Reprojection capabilities
 *
 * When the {@link source} of the layer has a different coordinate system (CRS) than the instance,
 * the images from the source will be reprojected to the instance CRS.
 *
 * Note that doing so will have a performance cost in both CPU and memory.
 *
 * @example
 * // Add and create a new Layer to a map.
 * const newLayer = ColorLayer('myColorLayerId', { ... });
 * map.addLayer(newLayer);
 *
 * // Change layer's visibilty
 * const layerToChange = map.getLayers(layer => layer.id === 'idLayerToChange')[0];
 * layerToChange.visible = false;
 * instance.notifyChange(); // update instance
 *
 * // Change layer's opacity
 * const layerToChange = map.getLayers(layer => layer.id === 'idLayerToChange')[0];
 * layerToChange.opacity = 0.5;
 * instance.notifyChange(); // update instance
 *
 * // Listen to properties
 * const layerToListen = map.getLayers(layer => layer.id === 'idLayerToListen')[0];
 * layerToListen.addEventListener('visible-property-changed', (event) => console.log(event));
 */
abstract class Layer extends EventDispatcher
    implements Progress {
    /**
     * The unique identifier of this layer.
     */
    readonly id: string;
    private readonly uuid: string;
    readonly isLayer: boolean = true;
    type: string;
    readonly interpretation: Interpretation;
    readonly showTileBorders: boolean;
    readonly fillNoData: boolean;
    readonly computeMinMax: boolean;
    private _visible: boolean;
    readonly colorMap: ColorMap;
    readonly extent: Extent;
    private readonly renderTargetPool: Map<string, Array<WebGLRenderTarget>>;
    private readonly source: ImageSource;
    protected composer: LayerComposer;
    private readonly targets: Map<number, Target>;
    private readonly filter: Function;
    protected readonly queue: RequestQueue;
    private shouldNotify: boolean;
    disposed: boolean;
    private readonly opCounter: OperationCounter;
    private initializing: boolean;
    private sortedTargets: Target[];
    private _instance: Instance;
    private readonly noDataValue: number;
    private readonly createReadableTextures: boolean;

    whenReady: Promise<Layer>;

    ready: boolean;

    backgroundColor: Color;

    /**
     * Disables automatic updates of this layer. Useful for debugging purposes.
     */
    frozen: boolean = false;

    /**
     * Creates a layer.
     *
     * @param id The unique identifier of the layer.
     * @param options The layer options.
     * @param options.source The data source of this layer.
     * @param options.extent The optional extent of the layer. If defined, only parts of the layer
     * inside the extent will be displayed.
     * @param options.interpretation How to interpret the values in the dataset.
     * @param options.backgroundColor The background color of the layer.
     * @param options.fillNoData Enables or disables no-data filling for images.
     * @param options.computeMinMax Computes min/max for images.
     * @param options.colorMap An optional color map for this layer.
     * @param options.showTileBorders Shows the borders of the tiles.
     * @param options.noDataValue The no-data value.
     */
    constructor(id: string, options: {
        source: ImageSource;
        extent?: Extent;
        interpretation?: Interpretation;
        showTileBorders?: boolean;
        fillNoData?: boolean;
        computeMinMax?: boolean;
        colorMap?: ColorMap;
        backgroundColor?: ColorRepresentation;
        noDataValue?: number;
    }) {
        super();
        if (id === undefined || id === null) {
            throw new Error('id is undefined');
        }

        this.id = id;

        // We need a globally unique ID for this layer, to avoid collisions in the request queue.
        // The "id" property is not globally unique (only unique within a given map).
        this.uuid = MathUtils.generateUUID();

        this.type = 'Layer';
        this.interpretation = options.interpretation ?? Interpretation.Raw;
        this.showTileBorders = options.showTileBorders ?? false;

        this.frozen = false;

        this.fillNoData = options.fillNoData;
        this.computeMinMax = options.computeMinMax ?? false;
        this.createReadableTextures = this.computeMinMax != null && this.computeMinMax !== false;
        this._visible = true;
        this.noDataValue = options.noDataValue;

        this.colorMap = options.colorMap;

        this.extent = options.extent;
        this.renderTargetPool = new Map();

        if (!options.source || !(options.source instanceof ImageSource)) {
            throw new Error('missing or invalid source');
        }
        this.source = options.source;

        this.source.addEventListener('updated', () => this.onSourceUpdated());

        this.backgroundColor = new Color(options.backgroundColor);

        this.targets = new Map();

        // We only fetch images that we don't already have.
        this.filter = (imageId: string) => !this.composer.has(imageId);

        this.queue = DefaultQueue;

        this.shouldNotify = false;
        this.disposed = false;

        this.opCounter = new OperationCounter();
        this.initializing = false;
        this.sortedTargets = null;
    }

    private shouldCancelRequest(node: Node) {
        if (this.disposed) {
            return true;
        }

        if (node.disposed) {
            return true;
        }

        if (!node.parent || !node.material) {
            return true;
        }

        if (Array.isArray(node.material)) {
            return node.material.every(m => !m.visible);
        }

        return !node.material.visible;
    }

    private onSourceUpdated() {
        if (!this.ready) {
            return;
        }
        this.composer.clear();

        this.loadFallbackImages()
            .then(() => {
                for (const target of this.targets.values()) {
                    target.reset();
                }

                this._instance.notifyChange(this, true);
            });
    }

    /**
     * Gets or sets the visibility of this layer.
     *
     * @fires Layer#visible-property-changed
     */
    get visible() {
        return this._visible;
    }

    set visible(v) {
        if (this._visible !== v) {
            const event = EventUtils.createPropertyChangedEvent(this, 'visible', this._visible, v);
            this._visible = v;
            this.dispatchEvent(event);
        }
    }

    get loading() {
        return this.opCounter.loading;
    }

    get progress() {
        return this.opCounter.progress;
    }

    /**
     * @ignore
     */
    _preprocessLayer(instance: Instance) {
        if (this.initializing) {
            // Avoid preprocessing the layer multiple times.
            return this;
        }

        this.initializing = true;

        this._instance = instance;

        // Let's fetch a low resolution image to fill tiles until we have a better resolution.
        this.whenReady = this.prepare()
            .then(() => {
                this.ready = true;
                return this;
            });

        return this;
    }

    private async prepare() {
        this.opCounter.increment();
        const targetProjection = this._instance.referenceCrs;

        await this.source.initialize({
            targetProjection,
        });

        this.composer = new LayerComposer({
            renderer: this._instance.renderer,
            showImageOutlines: this.showTileBorders,
            extent: this.extent,
            computeMinMax: this.computeMinMax,
            sourceCrs: this.source.getCrs(),
            targetCrs: targetProjection,
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
     * @returns The layer final extent.
     */
    public getExtent(): Extent {
        // The layer extent takes precedence over the source extent,
        // since it maye be used for some cropping effect.
        return this.extent ?? this.source.getExtent().clone().as(this._instance.referenceCrs);
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

        const extentAsSourceCrs = extent.clone().as(this.source.getCrs());
        const requests = this.source.getImages({
            id: 'background',
            extent: extentAsSourceCrs,
            width,
            height,
            createReadableTextures: this.createReadableTextures,
        });

        const promises = requests.map(img => img.request());

        this.opCounter.increment();

        const results = await Promise.allSettled(promises);

        this.opCounter.decrement();

        for (const result of results) {
            if (result.status === PromiseStatus.Fullfilled) {
                const image = (result as PromiseFulfilledResult<ImageResult>).value;

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
    protected async onInitialized() {
        // Implemented in derived classes.
    }

    /**
     * @param options Options.
     * @param options.extent The request extent.
     * @param options.width The request width, in pixels.
     * @param options.height The request height, in pixels.
     * @param options.target The target of the images.
     * @param options.alwaysVisible If true, the image is always visible on the canvas.
     * @returns A promise that is settled when all images have been fetched.
     */
    private async fetchImages(options: {
        extent: Extent;
        width: number;
        height: number;
        target: Target;
        alwaysVisible?: boolean;
    }): Promise<void> {
        // Let's wait for a short time to avoid processing requests that become
        // immediately obsolete, such as tiles that become visible for a very brief moment.
        // Those tiles will be rendered using whatever data is available in the composer.
        await PromiseUtils.delay(200);

        const {
            extent,
            width,
            height,
            target,
            alwaysVisible,
        } = options;

        const node = target.node;

        if (this.shouldCancelRequest(node)) {
            target.abortAndThrow();
        }

        const results = this.source.getImages({
            id: `${target.node.id}`,
            extent: extent.clone().as(this.source.getCrs()),
            width,
            height,
            signal: target.controller.signal,
            createReadableTextures: this.createReadableTextures,
        });

        if (results.length === 0) {
            // No new image to generate
            return;
        }

        // Register the ids on the tile
        results.forEach(r => {
            target.imageIds.add(r.id);
        });

        if (this.shouldCancelRequest(node)) {
            target.abortAndThrow();
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
            }).then((image: ImageResult) => {
                if (!this.disposed) {
                    const opts = {
                        interpretation: this.interpretation,
                        fillNoData: this.fillNoData,
                        alwaysVisible,
                        flipY: this.source.flipY,
                        ...image,
                    };

                    this.composer.add(opts);
                    if (!this.shouldCancelRequest(node)) {
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
     * @param node The disposed node.
     */
    protected unregisterNode(node: Node) {
        const id = node.id;
        if (this.targets.has(id)) {
            const target = this.targets.get(id);
            this.releaseRenderTarget(target.renderTarget);
            this.targets.delete(id);
            this.composer.unlock(target.imageIds, id);
            target.state = TargetState.Disposed;
            target.abort();
            this.sortedTargets = null;
        }
    }

    // eslint-disable-next-line class-methods-use-this
    protected adjustExtent(extent: Extent): Extent {
        return extent;
    }

    /**
     * Adjusts the extent to avoid visual artifacts.
     *
     * @param originalExtent The original extent.
     * @param originalWidth The width, in pixels, of the original extent.
     * @param originalHeight The height, in pixels, of the original extent.
     * @returns {{extent: Extent, width: number, height: number }} And object containing the
     * adjusted extent, as well as adjusted pixel size.
     */
    // eslint-disable-next-line class-methods-use-this
    protected adjustExtentAndPixelSize(
        originalExtent: Extent,
        originalWidth: number,
        originalHeight: number,
    ): { extent: Extent; width: number; height: number; } {
        // This feature only makes sense if both the source and instance have the same CRS,
        // meaning that pixels can be aligned
        if (this.source.getCrs() === this._instance.referenceCrs) {
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
     * @returns Targets sorted by extent dimension.
     */
    private _getSortedTargets(): Target[] {
        if (this.sortedTargets == null) {
            this.sortedTargets = Array.from(this.targets.values()).sort((a, b) => {
                const ax = a.extent.dimensions(tmpDims).x;
                const bx = b.extent.dimensions(tmpDims).x;
                return ax - bx;
            });
        }

        return this.sortedTargets;
    }

    /**
     * @param target The target.
     * @returns The smallest target that still contains this extent.
     */
    private getParent(target: Target): Target {
        const extent = target.extent;
        const targets = this._getSortedTargets();
        for (const t of targets) {
            if (extent.isInside(t.extent) && t.state === TargetState.Complete) {
                return t;
            }
        }

        return null;
    }

    /**
     * @param target The target.
     */
    protected applyDefaultTexture(target: Target) {
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
     * @param target The target to paint.
     */
    private processTarget(target: Target) {
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
        const width = target.width;
        const height = target.height;
        const pitch = target.pitch;

        // Fetch adequate images from the source...
        const isContained = this.contains(extent);
        if (isContained) {
            if (!target.renderTarget) {
                target.renderTarget = this.acquireRenderTarget(width, height);

                this.applyDefaultTexture(target);
            }

            this.fetchImages({
                extent, width, height, target,
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
                this.applyTextureToNode({ texture, pitch }, target.node, isLastRender);
                this._instance.notifyChange(this);
            }).catch(err => {
                // Abort errors are perfectly normal, so we don't need to log them.
                // However any other error implies an abnormal termination of the processing.
                if (err.message !== 'aborted') {
                    console.error(err);
                }

                target.state = TargetState.Pending;
            });
        } else {
            this.applyEmptyTextureToNode(target.node);
        }
    }

    /**
     * Updates the provided node with content from this layer.
     *
     * @param context the context
     * @param node the node to update
     */
    public update(context: Context, node: Node): void {
        if (this.disposed) {
            throw new Error('the layer is disposed');
        }

        if (!this.ready) {
            return;
        }

        const { material } = node;

        if (!node.parent || !material) {
            return;
        }

        // Node is hidden, no need to update it
        if (Array.isArray(node.material)) {
            if (node.material.every(m => !m.visible)) {
                return;
            }
        } else if (!node.material.visible) {
            return;
        }

        let target: Target;

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
            this.sortedTargets = null;

            this.registerNode(node, extent);

            // Since the node does not own the texture for this layer, we need to be
            // notified whenever it is disposed so we can in turn dispose the texture.
            node.addEventListener('dispose', () => this.unregisterNode(node));
        } else {
            target = this.targets.get(node.id);
        }

        if (Array.isArray(material)) {
            material.forEach(m => this.updateMaterial(m));
        } else {
            this.updateMaterial(material);
        }

        // An update is pending / or impossible -> abort
        if (this.frozen || !this.visible) {
            return;
        }

        // Repaint the target if necessary.
        this.processTarget(target);
    }

    /**
     * @param extent The extent to test.
     * @returns `true` if this layer contains the specified extent, `false` otherwise.
     */
    public contains(extent: Extent): boolean {
        const customExtent = this.extent;
        if (customExtent) {
            if (!customExtent.intersectsExtent(extent)) {
                return false;
            }
        }

        return this.source.contains(extent);
    }

    protected getRenderTargetDataType() {
        return this.source.datatype;
    }

    /**
     * @param target The render target to release.
     */
    private releaseRenderTarget(target: WebGLRenderTarget) {
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
     * @param width Width
     * @param height Height
     * @returns The render target.
     */
    private acquireRenderTarget(width: number, height: number): WebGLRenderTarget {
        const type = this.getRenderTargetDataType();

        const key = `${width}${height}`;

        let pool: Array<WebGLRenderTarget>;

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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, class-methods-use-this
    protected updateMaterial(material: Material) {
        // Implemented in derived classes
    }

    protected abstract registerNode(node: Node, extent: Extent): void;

    protected abstract applyTextureToNode(
        texture: TextureAndPitch,
        node: Node,
        isLastRender: boolean
    ): void;

    protected abstract applyEmptyTextureToNode(node: Node): void;

    /**
     * Disposes the layer. This releases all resources held by this layer.
     */
    public dispose(): void {
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
