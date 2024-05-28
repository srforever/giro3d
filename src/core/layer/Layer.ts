import {
    Color,
    type ColorRepresentation,
    EventDispatcher,
    LinearFilter,
    type Material,
    MathUtils,
    type Texture,
    Vector2,
    type WebGLRenderTarget,
    type PixelFormat,
    type TextureDataType,
    type Object3D,
    type Object3DEventMap,
    type RenderTargetOptions,
} from 'three';

import type ColorMap from './ColorMap';
import Interpretation from './Interpretation';
import type Extent from '../geographic/Extent';
import LayerComposer from './LayerComposer';
import PromiseUtils, { PromiseStatus } from '../../utils/PromiseUtils';
import MemoryTracker from '../../renderer/MemoryTracker';
import type Instance from '../Instance';
import ImageSource, { type ImageResult } from '../../sources/ImageSource';
import type RequestQueue from '../RequestQueue';
import { DefaultQueue } from '../RequestQueue';
import OperationCounter from '../OperationCounter';
import type Context from '../Context';
import type Progress from '../Progress.js';
import type NoDataOptions from './NoDataOptions';
import { GlobalRenderTargetPool } from '../../renderer/RenderTargetPool';
import type MemoryUsage from '../MemoryUsage';
import TextureGenerator from '../../utils/TextureGenerator';
import {
    createEmptyReport,
    type GetMemoryUsageContext,
    type MemoryUsageReport,
} from '../MemoryUsage';
import type OffsetScale from '../OffsetScale';
import type ColorLayer from './ColorLayer';
import type ElevationRange from '../ElevationRange';

export interface TextureAndPitch {
    texture: Texture;
    pitch: OffsetScale;
}

const tmpDims = new Vector2();

interface NodeEventMap extends Object3DEventMap {
    dispose: {
        /** empty */
    };
    'visibility-changed': {
        /** empty */
    };
}

export interface NodeMaterial extends Material {
    setColorTextures(layer: ColorLayer, textureAndPitch: TextureAndPitch): void;
    setLayerVisibility(layer: ColorLayer, visible: boolean): void;
    setLayerOpacity(layer: ColorLayer, opacity: number): void;
    setLayerElevationRange(layer: ColorLayer, range: ElevationRange): void;
    setColorimetry(
        layer: ColorLayer,
        brightness: number,
        contrast: number,
        saturation: number,
    ): void;
    hasColorLayer(layer: ColorLayer): boolean;
    indexOfColorLayer(layer: ColorLayer): number;
    removeColorLayer(layer: ColorLayer): void;
    pushColorLayer(layer: ColorLayer, extent: Extent): void;
}

export interface Node extends Object3D<NodeEventMap> {
    disposed: boolean;
    material: NodeMaterial;
    textureSize: Vector2;
    canProcessColorLayer(): boolean;
    getExtent(): Extent;
    level: number;
}

enum TargetState {
    Pending = 0,
    Processing = 1,
    Complete = 2,
}

function shouldCancel(node: Node): boolean {
    if (node.disposed) {
        return true;
    }

    if (!node.parent || !node.material) {
        return true;
    }

    return !node.material.visible;
}

export class Target implements MemoryUsage {
    node: Node;
    pitch: OffsetScale;
    extent: Extent;
    width: number;
    height: number;
    renderTarget: WebGLRenderTarget;
    imageIds: Set<string>;
    controller: AbortController;
    state: TargetState;
    geometryExtent: Extent;
    private _disposed = false;
    private _onVisibilityChanged: () => void;

    isDisposed() {
        return this.node.disposed || this._disposed;
    }

    getMemoryUsage(context: GetMemoryUsageContext, target?: MemoryUsageReport): MemoryUsageReport {
        if (this.renderTarget) {
            return TextureGenerator.getMemoryUsage(this.renderTarget, context, target);
        }
        return target ?? createEmptyReport();
    }

    constructor(options: {
        node: Node;
        extent: Extent;
        geometryExtent: Extent;
        pitch: OffsetScale;
        width: number;
        height: number;
    }) {
        this.node = options.node;
        this.pitch = options.pitch;
        this.extent = options.extent;
        this.geometryExtent = options.geometryExtent;
        this.width = options.width;
        this.height = options.height;
        this.imageIds = new Set();
        this.controller = new AbortController();
        this.state = TargetState.Pending;

        this._onVisibilityChanged = this.onVisibilityChanged.bind(this);

        this.node.addEventListener('visibility-changed', this._onVisibilityChanged);
    }

    dispose() {
        this._disposed = true;
        this.node.removeEventListener('visibility-changed', this._onVisibilityChanged);
        this.abort();
    }

    private onVisibilityChanged() {
        if (shouldCancel(this.node)) {
            // If the node became invisible before we could complete the processing, cancel it.
            if (this.state !== TargetState.Complete) {
                this.abort();
                this.state = TargetState.Pending;
            }
        }
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

export interface LayerEvents {
    /**
     * Fires when layer visibility changes.
     */
    'visible-property-changed': { visible: boolean };
}

export interface LayerOptions {
    /**
     * An optional name for this layer.
     */
    name?: string;
    /**
     * The source of the layer.
     */
    source: ImageSource;
    /**
     * The optional extent to use for this layer. If none is provided, then the extent from the
     * source is used instead. The layer will not be visible outside this extent.
     */
    extent?: Extent;
    /**
     * How to interpret the pixel data of the source.
     */
    interpretation?: Interpretation;
    /**
     * Displays the border of source images.
     */
    showTileBorders?: boolean;
    /**
     * Displays empty textures as colored rectangles.
     */
    showEmptyTextures?: boolean;
    /**
     * How to treat no-data values.
     */
    noDataOptions?: NoDataOptions;
    /**
     * Enables min/max computation of source images. Mainly used for elevation data.
     */
    computeMinMax?: boolean;
    /**
     * The optional color map to use.
     */
    colorMap?: ColorMap;
    /**
     * Enables or disable preloading of low resolution fallback images. Those fallback images
     * are used when no data is available yet on a particular region of the layer.
     */
    preloadImages?: boolean;
    /**
     * The optional background color of the layer.
     */
    backgroundColor?: ColorRepresentation;
    /**
     * The resolution factor applied to textures generated by this layer, compared to the pixel size
     * of the targets. Default is `1`. A value greater than one will create textures with a higher
     * resolution than what is asked by the targets. For example, if a map tile has a texture size
     * of 256\*256, and a layer has a resolution factor of 2, the generated textures will have a
     * size of 512\*512 pixels.
     */
    resolutionFactor?: number;
}

export type LayerUserData = Record<string, unknown>;

const nodesToDelete: Node[] = [];

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
 * ## The `userData` property
 *
 * The `userData` property can be used to attach custom data to the layer, in a type safe manner.
 * It is recommended to use this property instead of attaching arbitrary properties to the object:
 *
 * ```ts
 * type MyCustomUserData = {
 *   creationDate: Date;
 *   owner: string;
 * };
 * const newLayer = new ColorLayer<MyCustomUserData>({ ... });
 *
 * newLayer.userData.creationDate = Date.now();
 * newLayer.userData.owner = 'John Doe';
 * ```
 *
 * ## Reprojection capabilities
 *
 * When the {@link source} of the layer has a different coordinate system (CRS) than the instance,
 * the images from the source will be reprojected to the instance CRS.
 *
 * Note that doing so will have a performance cost in both CPU and memory.
 *
 * ```js
 * // Add and create a new Layer to an existing map.
 * const newLayer = new ColorLayer({ ... });
 *
 * await map.addLayer(newLayer);
 *
 * // Change layer's visibilty
 * newLayer.visible = false;
 * instance.notifyChange(); // update instance
 *
 * // Change layer's opacity
 * newLayer.opacity = 0.5;
 * instance.notifyChange(); // update instance
 *
 * // Listen to properties
 * newLayer.addEventListener('visible-property-changed', (event) => console.log(event));
 * ```
 * @typeParam TEvents - The event map of the layer.
 * @typeParam TUserData - The type of the `userData` property.
 */
abstract class Layer<
        TEvents extends LayerEvents = LayerEvents,
        TUserData extends LayerUserData = LayerUserData,
    >
    extends EventDispatcher<TEvents & LayerEvents>
    implements Progress, MemoryUsage
{
    /**
     * Optional name of this layer.
     */
    readonly name: string;
    /**
     * The unique identifier of this layer.
     */
    readonly id: string;
    /**
     * Read-only flag to check if a given object is of type Layer.
     */
    readonly isLayer: boolean = true;
    type: string;
    readonly interpretation: Interpretation;
    readonly showTileBorders: boolean;
    readonly showEmptyTextures: boolean;
    readonly noDataOptions: NoDataOptions;
    readonly computeMinMax: boolean;
    private _visible: boolean;
    /** The colormap of this layer */
    readonly colorMap: ColorMap;
    /** The extent of this layer */
    readonly extent: Extent;
    /** The source of this layer */
    readonly source: ImageSource;
    protected _composer: LayerComposer;
    private readonly _targets: Map<number, Target>;
    private readonly _filter: (id: string) => boolean;
    protected readonly _queue: RequestQueue;
    private _shouldNotify: boolean;
    disposed: boolean;
    private readonly _opCounter: OperationCounter;
    private _sortedTargets: Target[];
    private _instance: Instance;
    private readonly _createReadableTextures: boolean;
    private readonly _preloadImages: boolean;
    private _fallbackImagesPromise: Promise<void>;
    /** The resolution factor applied to the textures generated by this layer. */
    readonly resolutionFactor: number;
    private _preprocessOnce: Promise<this>;
    private _onNodeDisposed: (options: { target: Node }) => void;
    private _ready: boolean;

    backgroundColor: Color;

    /**
     * An object that can be used to store custom data about the {@link Layer}.
     */
    readonly userData: TUserData;

    /**
     * Disables automatic updates of this layer. Useful for debugging purposes.
     */
    frozen = false;

    get ready() {
        return this._ready;
    }

    getMemoryUsage(context: GetMemoryUsageContext, target?: MemoryUsageReport): MemoryUsageReport {
        const result = target ?? createEmptyReport();

        this._targets.forEach(target => target.getMemoryUsage(context, result));

        if (this.composer) {
            this.composer.getMemoryUsage(context, result);
        }

        this.source.getMemoryUsage(context, result);

        return result;
    }

    /**
     * Creates a layer.
     *
     * @param options - The layer options.
     */
    constructor(options: LayerOptions) {
        super();
        this.name = options.name;

        // @ts-expect-error {} is not assignable to TUserData in the case when the initial
        // value is not provided. However, we have no way to initialize the userData to a
        // correct default value. Instead of assigning to null/undefined, the compromise is
        // to assign to the empty object.
        this.userData = {};

        this._onNodeDisposed = e => this.unregisterNode(e.target);

        // We need a globally unique ID for this layer, to avoid collisions in the request queue.
        this.id = MathUtils.generateUUID();

        this.type = 'Layer';
        this.interpretation = options.interpretation ?? Interpretation.Raw;
        this.showTileBorders = options.showTileBorders ?? false;
        this.showEmptyTextures = options.showEmptyTextures ?? false;

        this._preloadImages = options.preloadImages ?? false;
        this._fallbackImagesPromise = null;

        this.noDataOptions = options.noDataOptions ?? { replaceNoData: false };
        this.computeMinMax = options.computeMinMax ?? false;
        this._createReadableTextures = this.computeMinMax != null && this.computeMinMax !== false;
        this._visible = true;

        this.colorMap = options.colorMap;

        this.extent = options.extent;
        this.resolutionFactor = options.resolutionFactor ?? 1;

        if (!options.source || !(options.source instanceof ImageSource)) {
            throw new Error('missing or invalid source');
        }
        this.source = options.source;

        this.source.addEventListener('updated', () => this.onSourceUpdated());

        this.backgroundColor = new Color(options.backgroundColor);

        this._targets = new Map();

        // We only fetch images that we don't already have.
        this._filter = (imageId: string) => !this._composer.has(imageId);

        this._queue = DefaultQueue;

        this._shouldNotify = false;
        this.disposed = false;

        this._opCounter = new OperationCounter();
        this._sortedTargets = null;
    }

    private shouldCancelRequest(node: Node) {
        if (this.disposed) {
            return true;
        }

        return shouldCancel(node);
    }

    private onSourceUpdated() {
        this.clear();
    }

    /**
     * Resets all render targets to a blank state and repaint all the targets.
     */
    clear() {
        if (!this.ready) {
            return;
        }
        this._composer.clear();

        this._fallbackImagesPromise = null;

        this.loadFallbackImages().then(() => {
            for (const target of this._targets.values()) {
                target.reset();
            }

            this._instance.notifyChange(this, true);
        });
    }

    /**
     * Gets or sets the visibility of this layer.
     */
    get visible() {
        return this._visible;
    }

    set visible(v) {
        if (this._visible !== v) {
            this._visible = v;
            this.dispatchEvent({ type: 'visible-property-changed', visible: v });
        }
    }

    get loading() {
        return this._opCounter.loading;
    }

    get progress() {
        return this._opCounter.progress;
    }

    /**
     * Initializes this layer. Note: this method is automatically called when the layer is added
     * to an entity.
     *
     * @param options - Initialization options.
     * @returns A promise that resolves when the initialization is complete.
     * @internal
     */
    initialize(options: {
        /**
         * The instance to associate this layer.
         * Once set, the layer cannot be used with any other instance.
         */
        instance: Instance;
    }): Promise<this> {
        const { instance } = options;
        if (this._instance != null && instance !== this._instance) {
            throw new Error('This layer has already been initialized for another instance.');
        }

        this._instance = instance;

        if (this.extent && this.extent.crs() !== instance.referenceCrs) {
            throw new Error(
                `the extent of the layer was defined in a different CRS (${this.extent.crs()}) than the instance's (${instance.referenceCrs}). Please convert the extent to the instance CRS before creating the layer.`,
            );
        }

        if (!this._preprocessOnce) {
            this._preprocessOnce = this.initializeOnce().then(() => {
                this._ready = true;
                return this;
            });
        }

        return this._preprocessOnce;
    }

    /**
     * Perform the initialization. This should be called exactly once in the lifetime of the layer.
     */
    private async initializeOnce() {
        this._opCounter.increment();
        const targetProjection = this._instance.referenceCrs;

        await this.source.initialize({
            targetProjection,
        });

        this._composer = new LayerComposer({
            renderer: this._instance.renderer,
            showImageOutlines: this.showTileBorders,
            showEmptyTextures: this.showEmptyTextures,
            extent: this.extent,
            computeMinMax: this.computeMinMax,
            sourceCrs: this.source.getCrs(),
            targetCrs: targetProjection,
            interpretation: this.interpretation,
            fillNoData: this.noDataOptions.replaceNoData,
            fillNoDataAlphaReplacement: this.noDataOptions.alpha,
            fillNoDataRadius: this.noDataOptions.maxSearchDistance,
            textureDataType: this.getRenderTargetDataType(),
            pixelFormat: this.getRenderTargetPixelFormat(),
        });

        if (this._preloadImages) {
            await this.loadFallbackImages();
        }

        this._instance.notifyChange(this);
        this._opCounter.decrement();

        return this;
    }

    /**
     * Returns the final extent of this layer. If this layer has its own extent defined,
     * this will be used.
     * Otherwise, will return the source extent (if any).
     * May return undefined if not pre-processed yet.
     *
     * @returns The layer final extent.
     */
    public getExtent(): Extent | undefined {
        // The layer extent takes precedence over the source extent,
        // since it maye be used for some cropping effect.
        return this.extent ?? this.source.getExtent()?.clone()?.as(this._instance.referenceCrs);
    }

    async loadFallbackImagesInternal() {
        const extent = this.getExtent();

        // If neither the source nor the layer are able to provide an extent,
        // we cannot reliably fetch fallback images.
        if (!extent) {
            return;
        }
        const width = 512 * this.resolutionFactor;
        const dims = extent.dimensions();
        const height = width * (dims.y / dims.x);

        const extentAsSourceCrs = extent.clone().as(this.source.getCrs());
        const requests = this.source.getImages({
            id: 'background',
            extent: extentAsSourceCrs,
            width,
            height,
            createReadableTextures: this._createReadableTextures,
        });

        const promises = requests.map(img => img.request());

        this._opCounter.increment();

        const results = await Promise.allSettled(promises);

        this._opCounter.decrement();

        for (const result of results) {
            if (result.status === PromiseStatus.Fullfilled) {
                const image = (result as PromiseFulfilledResult<ImageResult>).value;

                this.addToComposer(image, true);
            }
        }

        await this.onInitialized();
    }

    protected onTextureCreated(texture: Texture): void {
        // Interpretation color space have a higher precedence.
        texture.colorSpace = this.interpretation.colorSpace ?? this.source.colorSpace;
    }

    private addToComposer(image: ImageResult, alwaysVisible: boolean) {
        this.onTextureCreated(image.texture);

        this._composer.add({
            alwaysVisible, // Ensures background images are never deleted
            flipY: this.source.flipY,
            ...image,
        });
    }

    async loadFallbackImages() {
        if (!this._preloadImages) {
            return;
        }

        if (!this._fallbackImagesPromise) {
            // Let's fetch a low resolution image to fill tiles until we have a better resolution.
            this._fallbackImagesPromise = this.loadFallbackImagesInternal();
        }

        await this._fallbackImagesPromise;
    }

    /**
     * Called when the layer has finished initializing.
     */
    // eslint-disable-next-line class-methods-use-this
    protected async onInitialized() {
        // Implemented in derived classes.
    }

    /**
     * @param options - Options.
     * @returns A promise that is settled when all images have been fetched.
     */
    private async fetchImages(options: {
        /** The request extent. */
        extent: Extent;
        /** The request width, in pixels. */
        width: number;
        /** The request height, in pixels. */
        height: number;
        /** The target of the images. */
        target: Target;
    }): Promise<void> {
        const { extent, width, height, target } = options;

        const node = target.node;

        const results = this.source.getImages({
            id: `${target.node.id}`,
            extent: extent.clone().as(this.source.getCrs()),
            width,
            height,
            signal: target.controller.signal,
            createReadableTextures: this._createReadableTextures,
        });

        if (results.length === 0) {
            // No new image to generate
            return;
        }

        // Register the ids on the tile
        results.forEach(r => {
            target.imageIds.add(r.id);
        });

        // Let's wait for a short time to avoid processing requests that become
        // immediately obsolete, such as tiles that become visible for a very brief moment.
        // Those tiles will be rendered using whatever data is available in the composer.
        await PromiseUtils.delay(200);

        if (this.shouldCancelRequest(node)) {
            target.abortAndThrow();
        }

        const allImages = [];

        for (const { id, request } of results) {
            if (!request || this._composer.has(id)) {
                continue;
            }

            // More recent requests should be served first.
            const priority = performance.now();
            const shouldExecute = () => node.visible && this._filter(id);

            this._opCounter.increment();

            const requestId = `${this.id}-${id}`;

            const p = this._queue
                .enqueue({
                    id: requestId,
                    request,
                    priority,
                    shouldExecute,
                })
                .then((image: ImageResult) => {
                    if (!this.disposed) {
                        this.addToComposer(image, false);
                        if (!this.shouldCancelRequest(node)) {
                            this._composer.lock(id, node.id);
                        }
                    }
                })
                .catch(e => {
                    if (e.name !== 'AbortError') {
                        console.error(e);
                    }
                })
                .finally(() => {
                    this._opCounter.decrement();
                });

            allImages.push(p);
        }

        await Promise.allSettled(allImages);
    }

    /**
     * Removes the node from this layer.
     *
     * @param node - The disposed node.
     */
    unregisterNode(node: Node) {
        const id = node.id;
        if (this._targets.has(id)) {
            const target = this._targets.get(id);
            this.releaseRenderTarget(target.renderTarget);
            this._targets.delete(id);
            this._composer.unlock(target.imageIds, id);
            target.dispose();
            this._sortedTargets = null;
            node.removeEventListener('dispose', this._onNodeDisposed);
        }
    }

    // eslint-disable-next-line class-methods-use-this
    protected adjustExtent(extent: Extent): Extent {
        return extent;
    }

    /**
     * Adjusts the extent to avoid visual artifacts.
     *
     * @param originalExtent - The original extent.
     * @param originalWidth - The width, in pixels, of the original extent.
     * @param originalHeight - The height, in pixels, of the original extent.
     * @returns And object containing the adjusted extent, as well as adjusted pixel size.
     */
    // eslint-disable-next-line class-methods-use-this
    protected adjustExtentAndPixelSize(
        originalExtent: Extent,
        originalWidth: number,
        originalHeight: number,
    ): { extent: Extent; width: number; height: number } {
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

            if (sourceAdjusted) {
                return sourceAdjusted;
            }
        }

        // Tough luck, the source does not implement this feature. Let's use a default
        // implementation: add a 5% margin to eliminate visual artifacts at the edges of tiles,
        // such as color bleeding in atlas textures and hillshading issues with elevation data.
        const margin = 0.05;
        const pixelMargin = 4;
        const marginExtent = originalExtent.withRelativeMargin(margin);

        // Should we crop the extent ?
        const adjustedExtent = this.adjustExtent(marginExtent);
        const width = originalWidth + pixelMargin * 2;
        const height = originalHeight + pixelMargin * 2;

        return { extent: adjustedExtent, width, height };
    }

    /**
     * @returns Targets sorted by extent dimension.
     */
    private getSortedTargets(): Target[] {
        if (this._sortedTargets == null) {
            this._sortedTargets = Array.from(this._targets.values()).sort((a, b) => {
                const ax = a.extent.dimensions(tmpDims).x;
                const bx = b.extent.dimensions(tmpDims).x;
                return ax - bx;
            });
        }

        return this._sortedTargets;
    }

    /**
     * Returns the first ancestor that is completely loaded, or null if not found.
     * @param target - The target.
     * @returns The smallest target that still contains this extent.
     */
    private getLoadedAncestor(target: Target): Target {
        const extent = target.geometryExtent;
        const targets = this.getSortedTargets();
        for (const t of targets) {
            const otherExtent = t.geometryExtent;
            if (t !== target && extent.isInside(otherExtent) && t.state === TargetState.Complete) {
                return t;
            }
        }

        return null;
    }

    /**
     * @param target - The target.
     */
    protected applyDefaultTexture(target: Target) {
        if (target.isDisposed()) {
            return;
        }

        const parent = this.getLoadedAncestor(target);

        if (parent) {
            const img = { texture: parent.renderTarget.texture, extent: parent.extent };

            // Inherit parent's texture by copying the data of the parent into the child.
            this._composer.copy({
                source: [img],
                dest: target.renderTarget,
                targetExtent: target.extent,
            });
        } else {
            // We didn't find any parent nor child, use whatever is present in the composer.
            this._composer.render({
                extent: target.extent,
                width: target.width,
                height: target.height,
                target: target.renderTarget,
                imageIds: target.imageIds,
                isFallbackMode: true,
            });
        }

        const texture = target.renderTarget.texture;
        this.applyTextureToNode({ texture, pitch: target.pitch }, target, false);
        this._instance.notifyChange(this);
    }

    /**
     * @internal
     */
    getInfo(node: Node): { state: string; imageCount: number } {
        const target = this._targets.get(node.id);
        if (target) {
            return { state: TargetState[target.state], imageCount: target.imageIds.size };
        }

        return { state: 'unknown', imageCount: -1 };
    }

    /**
     * Processes the target once, fetching all images relevant for this target,
     * then paints those images to the target's texture.
     *
     * @param target - The target to paint.
     */
    private processTarget(target: Target) {
        if (target.state !== TargetState.Pending) {
            return;
        }
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

            if (!this.canFetchImages(target)) {
                return;
            }

            target.state = TargetState.Processing;

            this.fetchImages({
                extent,
                width,
                height,
                target,
            })
                .then(() => {
                    if (target.isDisposed()) {
                        return;
                    }

                    const { isLastRender } = this._composer.render({
                        extent,
                        width,
                        height,
                        target: target.renderTarget,
                        imageIds: target.imageIds,
                    });

                    if (isLastRender) {
                        target.state = TargetState.Complete;
                    } else {
                        target.state = TargetState.Pending;
                    }

                    const texture = target.renderTarget.texture;
                    this.applyTextureToNode({ texture, pitch }, target, isLastRender);
                    this._instance.notifyChange(this);
                })
                .catch(err => {
                    // Abort errors are perfectly normal, so we don't need to log them.
                    // However any other error implies an abnormal termination of the processing.
                    if (err.name !== 'AbortError') {
                        console.error(err);
                        target.state = TargetState.Complete;
                    } else {
                        target.state = TargetState.Pending;
                    }
                });
        } else {
            target.state = TargetState.Complete;
            this.applyEmptyTextureToNode(target.node);
        }
    }

    /**
     * Updates the provided node with content from this layer.
     *
     * @param context - the context
     * @param node - the node to update
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
        if (!node.material.visible) {
            return;
        }

        let target: Target;

        // First time we encounter this node
        if (!this._targets.has(node.id)) {
            const originalExtent = node.getExtent().clone();
            const textureSize = node.textureSize;
            // The texture that will be painted onto this node will not have the exact extent of
            // this node, to avoid problems caused by pixels sitting on the edge of the tile.
            const { extent, width, height } = this.adjustExtentAndPixelSize(
                originalExtent,
                Math.round(textureSize.x * this.resolutionFactor),
                Math.round(textureSize.y * this.resolutionFactor),
            );
            const pitch = originalExtent.offsetToParent(extent);

            target = new Target({
                node,
                extent,
                pitch,
                width: Math.round(width),
                height: Math.round(height),
                geometryExtent: originalExtent,
            });
            this._targets.set(node.id, target);
            this._sortedTargets = null;

            this.registerNode(node, extent);

            // Since the node does not own the texture for this layer, we need to be
            // notified whenever it is disposed so we can in turn dispose the texture.
            node.addEventListener('dispose', this._onNodeDisposed);
        } else {
            target = this._targets.get(node.id);
        }

        if (target.isDisposed()) {
            return;
        }

        this.updateMaterial(material);

        // An update is pending / or impossible -> abort
        if (this.frozen || !this.visible) {
            return;
        }

        // Repaint the target if necessary.
        this.processTarget(target);
    }

    protected abstract canFetchImages(target: Target): boolean;

    /**
     * @param extent - The extent to test.
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

    abstract getRenderTargetPixelFormat(): PixelFormat;

    abstract getRenderTargetDataType(): TextureDataType;

    /**
     * @param target - The render target to release.
     */
    private releaseRenderTarget(target: WebGLRenderTarget) {
        if (!target) {
            return;
        }
        GlobalRenderTargetPool.release(target, this._instance.renderer);
    }

    /**
     * @param width - Width
     * @param height - Height
     * @returns The render target.
     */
    private acquireRenderTarget(width: number, height: number): WebGLRenderTarget {
        const type = this.getRenderTargetDataType();

        const filter = TextureGenerator.getCompatibleTextureFilter(
            LinearFilter,
            type,
            this._instance.renderer,
        );

        const options: RenderTargetOptions = {
            format: this.getRenderTargetPixelFormat(),
            magFilter: filter,
            minFilter: filter,
            type,
            depthBuffer: false,
            generateMipmaps: false,
        };

        const result = GlobalRenderTargetPool.acquire(
            this._instance.renderer,
            width,
            height,
            options,
        );

        result.texture.name = `Layer "${this.id} - WebGLRenderTarget`;

        MemoryTracker.track(result, `Layer "${this.id} - WebGLRenderTarget`);
        return result;
    }

    protected deleteUnusedTargets() {
        nodesToDelete.length = 0;

        const sorted = this.getSortedTargets();

        // Let's start from the smallest tiles (i.e with the highest resolution) first.
        for (const target of sorted) {
            // Is this target invisible ? We can only unload invisible targets.
            // Note that we never delete root nodes so that we can always have some fallback data
            if (!target.node.material.visible) {
                const level = target.node.level;

                // Can we unload it ?
                // - We don't unload root nodes (level = 0)
                // - We also don't unload nodes every 3 levels
                // - We also don't unload nodes that do not have any loaded ancestor,
                //   to avoid sudden blank tiles.
                if (level > 0 && level % 3 !== 0 && this.getLoadedAncestor(target)) {
                    nodesToDelete.push(target.node);
                }
            }
        }

        for (const node of nodesToDelete) {
            this.unregisterNode(node);
        }
    }

    postUpdate() {
        if (this.disposed) {
            throw new Error('the layer is disposed');
        }

        this.deleteUnusedTargets();

        if (this._composer?.postUpdate() || this._shouldNotify) {
            this._instance.notifyChange(this);
        }
        this._shouldNotify = false;
    }

    get composer(): Readonly<LayerComposer> {
        return this._composer;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, class-methods-use-this
    protected updateMaterial(material: Material) {
        // Implemented in derived classes
    }

    abstract registerNode(node: Node, extent: Extent): void;

    protected abstract applyTextureToNode(
        texture: TextureAndPitch,
        target: Target,
        isLastRender: boolean,
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
        this.source.dispose();
        this._composer?.dispose();
        for (const target of this._targets.values()) {
            target.abort();
            this.unregisterNode(target.node);
            target.renderTarget?.dispose();
        }
    }
}

/**
 * Returns `true` if the given object is a {@link Layer}.
 */
export function isLayer(obj: unknown): obj is Layer {
    return typeof obj === 'object' && (obj as Layer)?.isLayer;
}

export default Layer;
