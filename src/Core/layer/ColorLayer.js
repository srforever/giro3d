/**
 * @module Core/layer/ColorLayer
 */
import { Vector4, DataTexture } from 'three';

import Cache from '../Scheduler/Cache.js';
import CancelledCommandException from '../Scheduler/CancelledCommandException.js';
import CogSource from '../../sources/CogSource.js';
import LayerUpdateState from './LayerUpdateState.js';

import Layer, {
    defineLayerProperty, nodeCommandQueuePriorityFunction,
    refinementCommandCancellationFn, MAX_RETRY,
} from './Layer.js';

/**
 * ColorLayer is used to add textures to a map.
 *
 * @api
 */
class ColorLayer extends Layer {
    /**
     * Creates an color layer. See the example for more information on layer creation.
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
     */
    constructor(id, options = {}) {
        super(id, options);
        this.type = 'ColorLayer';
        defineLayerProperty(this, 'frozen', false);
        defineLayerProperty(this, 'visible', true);
        defineLayerProperty(this, 'opacity', 1.0);
        defineLayerProperty(this, 'sequence', 0);
    }

    dispose(map) {
        map.object3d.traverse(o => {
            // TODO rename o.layer to o.giroobject, or o.object?
            if (o.layer === map) {
                // clean object of layer
                delete o.layerUpdateState[this.id];
                // delete texture in material
                // it's possible not to have this layer in this particular Mesh, see
                // `updateLayerElement`
                if (o.material && o.material.indexOfColorLayer(this) !== -1) {
                    o.material.removeLayer(this);
                }
            }
        });
    }

    initColorTexturesFromParent(context, node, parent) {
        if (!parent.material || !parent.material.getColorTexture) {
            return false;
        }

        const extent = node.getExtentForLayer(this);
        // move up until we have a parent that uses its own atlas
        // This is needed because otherwise we'll get inconsistencies: child will inherit the atlas,
        // but will compute its offset/scale values based on the result of
        // parent.material.getColorTexture()
        while (parent && parent.material && parent.material.uniforms.colorTexture
            && parent.material.uniforms.colorTexture.value
                !== parent.material.texturesInfo.color.atlasTexture) {
            parent = parent.parent;
        }
        if (!parent || !parent.material) {
            return false;
        }
        const texture = parent.material.getColorTexture(this);
        if (!texture) {
            return false;
        }

        if (!texture || !texture.extent) {
            return false;
        }

        if (parent.material.uniforms.colorTexture) {
            node.material.uniforms.colorTexture.value = parent.material.uniforms.colorTexture.value;
        }
        node.material.setColorTextures(this, {
            texture,
            pitch: extent.offsetToParent(texture.extent),
        }, true, context.instance);
        return true;
    }

    processArrayData(arrayData) {
        // Width and height in pixels of the returned data
        const { width, height } = arrayData;
        // We have to check wether it is an array of colors because we
        // want to handle floating point intensity files as color
        // layers too
        const data = new Uint8ClampedArray(width * height * 4);
        // If there are 3 bands, assume that it's RGB
        if (arrayData.length === 3) {
            const [r, g, b] = arrayData;
            for (let i = 0, l = r.length; i < l; i++) {
                const i4 = i * 4;
                data[i4 + 0] = r[i];
                data[i4 + 1] = g[i];
                data[i4 + 2] = b[i];
                data[i4 + 3] = 255;
            }
        // If there are 4 bands, assume that it's RGBA
        } else if (arrayData.length === 4) {
            const [r, g, b, a] = arrayData;
            for (let i = 0, l = r.length; i < l; i++) {
                const i4 = i * 4;
                data[i4 + 0] = r[i];
                data[i4 + 1] = g[i];
                data[i4 + 2] = b[i];
                data[i4 + 3] = a[i];
            }
        // Else if there is only one band, assume that it's not colored and
        // normalize it.
        } else {
            if (arrayData.length !== 1) {
                console.warn(
                    "Band selection isn't implemented yet.",
                    'Processing the first one as if it was a 1-band file.',
                );
            }
            const [v] = arrayData;
            const nodata = this.nodata;
            const dataMin = this.minmax.min;
            const dataFactor = 255 / (this.minmax.max - dataMin);
            for (let i = 0, l = v.length; i < l; i++) {
                const vi = v[i];
                const value = Math.round((vi - dataMin) * dataFactor);
                const i4 = i * 4;
                data[i4 + 0] = value;
                data[i4 + 1] = value;
                data[i4 + 2] = value;
                data[i4 + 3] = vi === nodata ? 0 : 255;
            }
        }
        return { data, width, height };
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

        // Initialisation
        if (this.ready && node.layerUpdateState[this.id] === undefined) {
            node.layerUpdateState[this.id] = new LayerUpdateState();

            // INIT TEXTURE
            material.pushLayer(this, node.getExtentForLayer(this));

            if (!this.tileInsideLimit(node, this)) {
                // we also need to check that tile's parent doesn't have a texture for this layer,
                // because even if this tile is outside of the layer, it could inherit it's
                // parent texture
                if (!this.noTextureParentOutsideLimit
                    && parent
                    && parent.material
                    && parent.material.getColorTexture(this)) {
                    // ok, we're going to inherit our parent's texture
                } else {
                    node.layerUpdateState[this.id].noMoreUpdatePossible();
                    return null;
                }
            }

            if (parent && this.initColorTexturesFromParent(context, node, parent, this)) {
                context.instance.notifyChange(node, false);
                return null;
            }
        }

        // Node is hidden, no need to update it
        if (!node.material.visible || initOnly) {
            return null;
        }

        // TODO: move this to defineLayerProperty() declaration
        // to avoid mixing layer's network updates and layer's params
        // Update material parameters
        material.setLayerVisibility(this, this.visible);
        material.setLayerOpacity(this, this.opacity);

        const ts = Date.now();
        // An update is pending / or impossible -> abort
        if (this.frozen || !this.visible || !node.layerUpdateState[this.id].canTryUpdate(ts)) {
            return null;
        }

        // Does this tile needs a new texture?
        const nextDownloads = this.getPossibleTextureImprovements(
            this,
            node.getExtentForLayer(this),
            node.material.getColorTexture(this),
            node.layerUpdateState[this.id].failureParams,
        );

        // if the provider returns undef, then we konw it will never have any texture
        // TODO make a superclass and document this behaviour (undefined: I'm done, null or false:
        // come back later)
        if (nextDownloads === undefined) {
            node.layerUpdateState[this.id].noMoreUpdatePossible();
            return null;
        }
        // in this case, the layer might be able to provide a texture later
        if (nextDownloads === null || nextDownloads === false) {
            return null;
        }

        node.layerUpdateState[this.id].newTry();
        const command = {
            /* mandatory */
            instance: context.instance,
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
                if (this.source instanceof CogSource && !result.texture) {
                    result.pitch = new Vector4(0, 0, 1, 1);
                    // Process the downloaded data
                    const { data, width, height } = this.processArrayData(result.arrayData);
                    const imageData = new ImageData(data, width, height);
                    result.texture = new DataTexture(imageData, width, height);
                    // Attach the extent to the texture to check for possible improvements
                    result.texture.extent = node.extent;
                    Cache.set(`${this.id}${node.extent._values.join(',')}`, result);
                }
                return node.material.setColorTextures(this, result, false, context.instance)
                    .then(() => {
                        node.layerUpdateState[this.id].success();
                    });
            },
            err => {
                if (err instanceof CancelledCommandException) {
                    node.layerUpdateState[this.id].success();
                } else {
                    console.warn('Imagery texture update error for', node, err);
                    const definitiveError = node.layerUpdateState[this.id].errorCount > MAX_RETRY;
                    node.layerUpdateState[this.id].failure(Date.now(), definitiveError, err);
                    if (!definitiveError) {
                        window.setTimeout(() => {
                            context.instance.notifyChange(node, false);
                        }, node.layerUpdateState[this.id].secondsUntilNextTry() * 1000);
                    }
                }
            },
        );
    }
}

export default ColorLayer;
