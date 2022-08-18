/**
 * @module Core/layer/ElevationLayer
 */
import DEMUtils, { ELEVATION_FORMAT } from '../../utils/DEMUtils.js';
import LayerUpdateState from './LayerUpdateState.js';
import CancelledCommandException from '../Scheduler/CancelledCommandException.js';

import Layer, {
    defineLayerProperty, nodeCommandQueuePriorityFunction,
    refinementCommandCancellationFn, MAX_RETRY,
} from './Layer.js';

// get image data
let fooCanvas;

/**
 * The ElevationLayer provides data to display terrain on a map.
 *
 * @api
 */
class ElevationLayer extends Layer {
    /**
     * Creates an elevation layer. See the example for more information on layer creation.
     *
     * @param {string} id the unique identifier of the layer
     * @param {object} options the layer options
     * @param {
     * module:ol.TileWMS|module:ol.Stamen|module:ol.Vector|module:ol.VectorTile
     * } options.source an OpenLayers source
     * @param {object} [options.extent=undefined] the geographic extent of the layer. If it is
     * undefined, the extent will be the same as the map where the layer will be added.
     * @param {string} [options.projection=undefined] the layer projection. Like extent, if
     * extent is not provided, the layer projection will be the map projection.
     * @param {object} [options.updateStrategy=undefined] the strategy to load new tiles, if it is
     * undefined, the layer will use the STRATEGY_MIN_NETWORK_TRAFFIC.
     * @param {string} [options.backgroundColor=undefined] the background color of the layer
     * @param {string} [options.elevationFormat=undefined] the elevation format
     * @param {string} [options.heightFieldOffset=undefined] if
     * <code>options.elevationFormat</code> is <code>ELEVATION_FORMAT.HEIGHFIELD</code>,
     * specifies the offset to use for scalar values in the height field.
     * Default is <code>0</code>.
     * @param {string} [options.heightFieldScale=undefined] if
     * <code>options.elevationFormat</code> is <code>ELEVATION_FORMAT.HEIGHFIELD</code>,
     * specifies the scale to use for scalar values in the height field.
     * Default is <code>255</code>.
     */
    constructor(id, options = {}) {
        super(id, options);
        this.elevationFormat = options.elevationFormat;
        if (this.elevationFormat === ELEVATION_FORMAT.HEIGHFIELD) {
            this.heightFieldOffset = options.heightFieldOffset || 0;
            this.heightFieldScale = options.heightFieldScale || 255;
        }
        this.type = 'ElevationLayer';
        defineLayerProperty(this, 'frozen', false);
    }

    static colorImageSetup(texture) {
        if (!fooCanvas) {
            fooCanvas = document.createElement('canvas');
            fooCanvas.width = 256;
            fooCanvas.height = 256;
        }
        const w = texture.image.width;
        const h = texture.image.height;
        const fooCtx = fooCanvas.getContext('2d');
        fooCanvas.width = w;
        fooCanvas.height = h;
        fooCtx.drawImage(texture.image, 0, 0);
        const { data } = fooCtx.getImageData(0, 0, w, h);
        const stride = w * 4;
        return { data, stride, h };
    }

    minMaxFromTexture(texture) { // no pitch ???
        if (texture.min != null && texture.max != null) {
            return {
                min: texture.min,
                max: texture.max,
            };
        }

        let min = Infinity;
        let max = -Infinity;
        if (this.elevationFormat === ELEVATION_FORMAT.MAPBOX_RGB) {
            const { data, stride, h } = ElevationLayer.colorImageSetup(texture);
            for (let i = 0; i < h; i++) {
                for (let j = 0; j < stride; j += 4) {
                    const val = DEMUtils.decodeMapboxElevation(
                        data[i * stride + j],
                        data[i * stride + j + 1],
                        data[i * stride + j + 2],
                    );
                    if (val < min) {
                        min = val;
                    }
                    if (val > max) {
                        max = val;
                    }
                }
            }
        } else if (this.elevationFormat === ELEVATION_FORMAT.HEIGHFIELD) {
            const { data, stride, h } = ElevationLayer.colorImageSetup(texture);
            for (let i = 0; i < h; i++) {
                for (let j = 0; j < stride; j += 4) {
                    min = Math.min(min, data[i * stride + j]);
                    max = Math.max(max, data[i * stride + j]);
                }
            }
            min = this.heightFieldOffset + this.heightFieldScale * (min / 255);
            max = this.heightFieldOffset + this.heightFieldScale * (max / 255);
        } else if (this.elevationFormat === ELEVATION_FORMAT.XBIL) {
            for (let i = 0; i < texture.image.data.length; i++) {
                const val = texture.image.data[i];
                if (val > -1000) {
                    min = Math.min(min, val);
                    max = Math.max(max, val);
                }
            }
        } else if (this.elevationFormat === ELEVATION_FORMAT.RATP_GEOL) {
            // TODO
            min = -1000;
            max = 1000;
        } else {
            throw new Error(`Unsupported layer.elevationFormat "${this.elevationFormat}'`);
        }

        texture.min = min;
        texture.max = max;
        return { min, max };
    }

    initNodeElevationTextureFromParent(node, parent) {
        const parentTextureInfo = parent.material.getElevationTextureInfo();
        if (!parentTextureInfo || !parentTextureInfo.texture.extent) {
            return;
        }
        const parentTexture = parentTextureInfo.texture;

        const extent = node.getExtentForLayer(this);

        const pitch = extent.offsetToParent(parentTexture.extent);
        const elevation = {
            texture: parentTexture,
            pitch,
        };

        let { min, max } = parentTexture;
        if (!min || !max) {
            ({ min, max } = this.minMaxFromTexture(parentTexture, pitch));
        }
        elevation.min = min;
        elevation.max = max;

        node.setTextureElevation(this, elevation);
    }

    _preprocessLayer(map, instance) {
        super._preprocessLayer(map, instance);

        // extra processing
        this.whenReady = this.whenReady.then(() => {
            const down = this.provider.getPossibleTextureImprovements(this, this.extent);
            return this.provider.executeCommand({
                layer: this,
                toDownload: down,
            }).then(result => {
                const minmax = this.minMaxFromTexture(result.texture, result.pitch);
                result.texture.min = minmax.min;
                result.texture.max = minmax.max;
                this.minmax = minmax;
            });
        });

        this.whenReady = this.whenReady.then(() => {
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
        });
        return this;
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

            if (parent
                && parent.material
                && this.initNodeElevationTextureFromParent(node, parent)) {
                context.instance.notifyChange(node, false);
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
        const nextDownloads = this.getPossibleTextureImprovements(
            this,
            node.getExtentForLayer(this),
            textureInfo && textureInfo.texture,
            node.layerUpdateState[this.id].failureParams,
        );

        if (!nextDownloads) {
            node.layerUpdateState[this.id].noMoreUpdatePossible();
            return null;
        }

        node.layerUpdateState[this.id].newTry();

        const command = {
            /* mandatory */
            view: context.instance,
            layer: this,
            requester: node,
            priority: nodeCommandQueuePriorityFunction(node),
            earlyDropFunction: refinementCommandCancellationFn,
            toDownload: nextDownloads,
        };

        return context.scheduler.execute(command).then(
            result => {
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
            const { min, max } = this.minMaxFromTexture(elevation.texture, elevation.pitch);
            elevation.min = min;
            elevation.max = max;

            node.setTextureElevation(this, elevation);
            node.layerUpdateState[this.id].success();
        });
    }
}

export default ElevationLayer;
