/**
 * @module core/layer/ElevationLayer
 */
import CancelledCommandException from '../scheduler/CancelledCommandException.js';
import LayerUpdateState from './LayerUpdateState.js';
import DataStatus from '../../provider/DataStatus.js';
import Interpretation from './Interpretation.js';
import Layer, {
    nodeCommandQueuePriorityFunction,
    refinementCommandCancellationFn, MAX_RETRY,
} from './Layer.js';
import ColorMap from './ColorMap.js';
import Extent from '../geographic/Extent.js';
import TextureGenerator from '../../utils/TextureGenerator.js';

// get image data
let canvas;

/**
 * The ElevationLayer provides data to display terrain on a map.
 *
 * @api
 */
class ElevationLayer extends Layer {
    /**
     * Creates an elevation layer.
     * It should be added in {@link module:entities/Map~Map Maps} to be displayed in the instance.
     * See the example for more information on layer creation.
     *
     * @param {string} id The unique identifier of the layer.
     * @param {object} options The layer options.
     * @param {
     * module:ol~TileImage |
     * module:ol~Vector |
     * module:ol~VectorTile |
     * module:sources/CogSource~CogSource|
     * module:sources/CustomTiledImageSource~CustomTiledImageSource} options.source
     * The data source of this layer.
     * @param {Interpretation} [options.interpretation=Interpretation.Raw] How to interpret the
     * values in the dataset.
     * @param {Extent} [options.extent=undefined] The geographic extent of the layer. If
     * unspecified, the extent will be inherited from the map.
     * @param {string} [options.projection=undefined] The layer projection. If unspecified,
     * the projection will be inherited from the map.
     * If unspecified, the layer will attempt to compute an approximation using downsampled data.
     * @param {object} [options.minmax] The minimal/maximal elevation values of this layer.
     * @param {number} [options.minmax.min] The minimal elevation of this layer.
     * @param {number} [options.minmax.max] The maximal elevation of this layer.
     * @param {object} [options.updateStrategy=undefined] The strategy to load new tiles.
     * If unspecified, the layer will use the `STRATEGY_MIN_NETWORK_TRAFFIC`.
     * @param {number} [options.noDataValue=undefined] the optional no-data value to pass to the
     * provider. Any pixel that matches this value will not be processed.
     * @param {ColorMap} [options.colorMap=undefined] An optional color map for this layer.
     */
    constructor(id, options = {}) {
        super(id, options);

        if (options.noDataValue) {
            this.noDataValue = options.noDataValue;
        }
        if (options.minmax) {
            this.minmax = options.minmax;
        }
        this.type = 'ElevationLayer';
    }

    static getBufferData(texture) {
        if (texture.isDataTexture) {
            if (texture.image.data) {
                if (texture.image.data.data) {
                    // DataTextures already have an ImageData available
                    return texture.image.data.data;
                }
                return texture.image.data;
            }
        }

        if (texture.isRenderTargetTexture && texture.data) {
            return texture.data;
        }

        if (!canvas) {
            canvas = document.createElement('canvas');
        }
        const ctx = canvas.getContext('2d');
        const w = texture.image.width;
        const h = texture.image.height;

        canvas.width = w;
        canvas.height = h;

        ctx.drawImage(texture.image, 0, 0);
        const { data } = ctx.getImageData(0, 0, w, h);
        return data;
    }

    minMaxFromTexture(texture) {
        if (texture.min != null && texture.max != null) {
            return {
                min: texture.min,
                max: texture.max,
            };
        }

        const data = ElevationLayer.getBufferData(texture);
        const { min, max } = TextureGenerator.computeMinMax(data, this.noDataValue);

        texture.min = min;
        texture.max = max;
        return { min, max };
    }

    initNodeFromRootTexture(node) {
        const extent = node.getExtentForLayer(this);
        const pitch = extent.offsetToParent(this.extent);

        const elevation = {
            texture: this.rootTexture,
            pitch,
        };

        let { min, max } = elevation.texture;
        if (!min || !max) {
            ({ min, max } = this.minMaxFromTexture(elevation.texture));
        }
        elevation.min = min;
        elevation.max = max;

        node.setElevationTexture(this, elevation, true);
    }

    initNodeElevationTextureFromParent(node, instance, parent) {
        let parentTexture;

        while (parent && parent.material) {
            const parentTextureInfo = parent.material.getElevationTextureInfo();
            if (parentTextureInfo && parentTextureInfo.texture.extent) {
                parentTexture = parentTextureInfo.texture;
                break;
            }
            parent = parent.parent;
        }

        if (!parentTexture) {
            return false;
        }

        const extent = node.getExtentForLayer(this);

        const pitch = extent.offsetToParent(parentTexture.extent);
        const elevation = {
            texture: parentTexture,
            pitch,
        };

        let { min, max } = parentTexture;
        if (!min || !max) {
            ({ min, max } = this.minMaxFromTexture(parentTexture));
        }
        elevation.min = min;
        elevation.max = max;

        node.setElevationTexture(this, elevation, true);

        return true;
    }

    // eslint-disable-next-line no-unused-vars
    _customPreprocessLayer(map, instance) {
        // There is an additional step in the elevation layer preprocessing :
        // We need to download a root texture that matches the layer extent
        // to precompute the min/max values of the whole layer, and also store this
        // root texture to be reused later in texture inheritance scenarios.
        const down = this.provider.getPossibleTextureImprovements({
            layer: this,
            extent: this.extent,
            size: map.imageSize,
        });

        // If there is no data available for the layer extent (e.g out of range zoom level in tiled
        // images), skip the root texture phase.
        if (down !== DataStatus.DATA_UNAVAILABLE) {
            return this.provider
                .executeCommand(instance, this, null, down)
                .then(result => this.handleRootTexture(result))
                .then(() => this.assignMinMaxToTiles(map));
        }

        return Promise.resolve();
    }

    assignMinMaxToTiles(map) {
        if (!this.minmax) {
            throw new Error('At this point the whole min/max should be known');
        }
        map.object3d.traverse(n => {
            if (n.setBBoxZ) {
                n.setBBoxZ(this.minmax.min, this.minmax.max);
            }
        });

        map.minMaxFromElevationLayer = {
            min: this.minmax.min,
            max: this.minmax.max,
        };
        for (const node of map.level0Nodes) {
            node.traverse(n => {
                if (n.setBBoxZ) {
                    n.setBBoxZ(
                        map.minMaxFromElevationLayer.min,
                        map.minMaxFromElevationLayer.max,
                    );
                }
            });
        }
        return this;
    }

    handleRootTexture(result) {
        if (!result) {
            return;
        }

        const p = result.pitch;
        if (p && p.x === 0 && p.y === 0 && p.z === 1 && p.w === 1) {
            // Store this texture as a wildcard texture for tiles
            // that have no texture available (not event their ancestors).
            // The only condition is that the root texture matches the extent of the layer.
            this.rootTexture = result.texture;
        }
        if (!this.minmax) {
            const minmax = this.minMaxFromTexture(result.texture);
            result.texture.min = minmax.min;
            result.texture.max = minmax.max;
            this.minmax = minmax;
        }
    }

    /**
     * Performs the update of the layer.
     *
     * @param {module:Core/Context~Context} context the context
     * @param {module:Core/TileMesh~TileMesh} node the node to update
     * @param {module:entities/Map~Map} parent the map where the layers have been added
     * @param {boolean} [initOnly = false] if true, the update is stopped before the update command
     * there is only a check that the layer state is defined in the node.
     * @returns {null|Promise} null if the update is not done,
     * else, that succeeds if the update is made.
     */
    update(context, node, parent, initOnly = false) {
        if (!this.ready) {
            return null;
        }

        const { material } = node;

        if (!node.parent || !material) {
            return null;
        }

        // TODO: we need either
        //  - compound or exclusive layers
        //  - support for multiple elevation layers

        // Initialisation
        if (node.layerUpdateState[this.id] === undefined) {
            node.layerUpdateState[this.id] = new LayerUpdateState();

            // When the tile is created, we try to inherit the texture from a parent or ancestor,
            // to be able to display something until our own texture is loaded.
            if (this.initNodeElevationTextureFromParent(node, context.instance, parent)) {
                context.instance.notifyChange(node);
                return null;
            }

            // When no ancestor has an available texture, let's use the low resolution root texture
            if (this.rootTexture) {
                this.initNodeFromRootTexture(node);
                context.instance.notifyChange(node);
                return null;
            }
        }

        // Try to update
        const ts = Date.now();

        // Possible conditions to *not* update the elevation texture
        if (initOnly
                || this.frozen
                || !node.material.visible
                || !node.layerUpdateState[this.id].canTryUpdate(ts)) {
            return null;
        }

        // Does this tile needs a new texture?
        const textureInfo = node.material.getElevationTextureInfo();

        const originalExtent = node.getExtentForLayer(this);

        // Add a 2% margin around the tile to mitigate boundary issues
        const extent = originalExtent.withRelativeMargin(0.02);

        const nextDownloads = this.provider.getPossibleTextureImprovements({
            layer: this,
            extent,
            texture: textureInfo && textureInfo.texture,
            size: node.textureSize,
        });

        if (nextDownloads === DataStatus.DATA_UNAVAILABLE) {
            node.layerUpdateState[this.id].noMoreUpdatePossible();
            return null;
        }

        if (nextDownloads === DataStatus.DATA_NOT_AVAILABLE_YET
            || nextDownloads === DataStatus.DATA_ALREADY_LOADED) {
            return null;
        }

        nextDownloads.pitch = originalExtent.offsetToParent(nextDownloads.extent);

        node.layerUpdateState[this.id].newTry();

        const command = {
            /* mandatory */
            instance: context.instance,
            layer: this,
            requester: node,
            priority: nodeCommandQueuePriorityFunction(node),
        };
        command.earlyDropFunction = () => refinementCommandCancellationFn({ requester: node });
        command.fn = () => this.provider.executeCommand(
            context.instance,
            this,
            node,
            nextDownloads,
            command.earlyDropFunction,
        );

        this._opCounter.increment();

        return context.scheduler.execute(command).then(
            result => {
                if (!result || !result.texture) {
                    return null;
                }
                if (node.material === null) {
                    return null;
                }
                // We currently only support a single elevation texture
                if (Array.isArray(result)) {
                    result = result[0];
                }
                return result;
            },
            err => {
                if (err instanceof CancelledCommandException) {
                    node.layerUpdateState[this.id].success();
                } else {
                    console.warn('Elevation texture update error for', node, err);
                    const definitiveError = node.layerUpdateState[this.id].errorCount > MAX_RETRY;
                    node.layerUpdateState[this.id].failure(Date.now(), definitiveError, err);
                    if (!definitiveError) {
                        window.setTimeout(() => {
                            context.instance.notifyChange(node, false);
                        }, node.layerUpdateState[this.id].secondsUntilNextTry() * 1000);
                    }
                }
            },
        ).then(elevation => {
            if (!elevation) {
                return;
            }
            const { min, max } = this.minMaxFromTexture(elevation.texture);
            elevation.min = min;
            elevation.max = max;
            node.setElevationTexture(this, elevation, false);
            node.layerUpdateState[this.id].success();
            context.instance.notifyChange(node);
        }).finally(() => this._opCounter.decrement());
    }
}

export default ElevationLayer;
