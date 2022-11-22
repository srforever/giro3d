/**
 * @module Core/layer/ColorLayer
 */
import CancelledCommandException from '../Scheduler/CancelledCommandException.js';
import LayerUpdateState from './LayerUpdateState.js';
import DataStatus from '../../Provider/DataStatus.js';

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
     * Creates a color layer.
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
     * @param {object} [options.extent=undefined] The geographic extent of the layer. If
     * unspecified, the extent will be inherited from the map.
     * @param {string} [options.projection=undefined] The layer projection. If unspecified,
     * the projection will be inherited from the map.
     * @param {object} [options.updateStrategy=undefined] The strategy to load new tiles.
     * If unspecified, the layer will use the `STRATEGY_MIN_NETWORK_TRAFFIC`.
     * @param {string} [options.backgroundColor=undefined] The background color of the layer.
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

        if (nextDownloads === DataStatus.DATA_UNAVAILABLE) {
            node.layerUpdateState[this.id].noMoreUpdatePossible();
            return null;
        }

        if (nextDownloads === DataStatus.DATA_NOT_AVAILABLE_YET
            || nextDownloads === DataStatus.DATA_ALREADY_LOADED) {
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
                if (node.disposed || node.material === null) {
                    // The node was disposed before the texture was assigned
                    result.texture.dispose();
                    return null;
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
