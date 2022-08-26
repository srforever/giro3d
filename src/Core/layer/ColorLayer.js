/**
 * @module Core/layer/ColorLayer
 */
import LayerUpdateState from './LayerUpdateState.js';
import CancelledCommandException from '../Scheduler/CancelledCommandException.js';

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
        defineLayerProperty(this, 'frozen', false);
        defineLayerProperty(this, 'visible', true);
        defineLayerProperty(this, 'opacity', 1.0);
        defineLayerProperty(this, 'sequence', 0);
    }

    clean(object) {
        object.object3d.traverse(o => {
            // TODO rename o.layer to o.giroobject, or o.object?
            // object is not a great name too...
            if (o.layer === object) {
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
        if (!parent.material || !parent.material.getLayerTexture) {
            return false;
        }

        const extent = node.getExtentForLayer(this);
        // move up until we have a parent that uses its own atlas
        // This is needed because otherwise we'll get inconsistencies: child will inherit the atlas,
        // but will compute its offset/scale values based on the result of
        // parent.material.getLayerTexture()
        while (parent && parent.material && parent.material.uniforms.colorTexture
            && parent.material.uniforms.colorTexture.value
                !== parent.material.texturesInfo.color.atlasTexture) {
            parent = parent.parent;
        }
        if (!parent || !parent.material) {
            return false;
        }
        const parentTexture = parent.material.getLayerTexture(this);
        if (!parentTexture) {
            return false;
        }

        const { texture } = parentTexture;

        if (!texture || !texture.extent) {
            return false;
        }

        node.material.setLayerTextures(this, {
            texture,
            pitch: extent.offsetToParent(texture.extent),
        }, true, context.instance);
        return true;
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
        if (node.layerUpdateState[this.id] === undefined) {
            node.layerUpdateState[this.id] = new LayerUpdateState();

            if (!this.tileInsideLimit(node, this)) {
                // we also need to check that tile's parent doesn't have a texture for this layer,
                // because even if this tile is outside of the layer, it could inherit it's
                // parent texture
                if (!this.noTextureParentOutsideLimit
                    && parent
                    && parent.material
                    && parent.material.getLayerTexture(this)) {
                    // ok, we're going to inherit our parent's texture
                } else {
                    node.layerUpdateState[this.id].noMoreUpdatePossible();
                    return null;
                }
            }

            // INIT TEXTURE
            material.pushLayer(this, node.getExtentForLayer(this));

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
        const existing = node.material.getLayerTexture(this);
        const nextDownloads = this.getPossibleTextureImprovements(
            this,
            node.getExtentForLayer(this),
            existing ? existing.texture : null,
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
                return node.material.setLayerTextures(this, result, false, context.instance)
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
