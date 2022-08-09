/**
 * @module Core/layer/Layer
 */
import { EventDispatcher } from 'three';

import TileWMS from 'ol/source/TileWMS.js';
import Vector from 'ol/source/Vector.js';
import VectorTile from 'ol/source/VectorTile.js';
import Stamen from 'ol/source/Stamen.js';

import { STRATEGY_MIN_NETWORK_TRAFFIC } from './LayerUpdateStrategy.js';
import CogSource from '../../sources/CogSource.js';
import StaticSource from '../../sources/StaticSource.js';

/**
 * Fires when layer sequence change (meaning when the order of the layer changes in the view)
 *
 * @api
 * @event Layer#sequence-property-changed
 * @property {object} new the new value of the property
 * @property {number} new.sequence the new value of the layer sequence
 * @property {object} previous the previous value of the property
 * @property {number} previous.sequence the previous value of the layer sequence
 * @property {Layer} target dispatched on layer
 * @property {string} type sequence-property-changed
 */

/**
 * Fires when layer opacity change
 *
 * @api
 * @event Layer#opacity-property-changed
 * @property {object} new the new value of the property
 * @property {object} new.opacity the new value of the layer opacity
 * @property {object} previous the previous value of the property
 * @property {object} previous.opacity  the previous value of the layer opacity
 * @property {Layer} target  dispatched on layer
 * @property {string} type opacity-property-changed
 */

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

const defineLayerProperty = function defineLayerProperty(layer,
    propertyName,
    defaultValue,
    onChange) {
    const existing = Object.getOwnPropertyDescriptor(layer, propertyName);
    if (!existing || !existing.set) {
        let property = layer[propertyName] === undefined ? defaultValue : layer[propertyName];
        Object.defineProperty(layer,
            propertyName,
            {
                get: () => property,
                set: newValue => {
                    if (property !== newValue) {
                        const event = {
                            type: `${propertyName}-property-changed`,
                            previous: {},
                            new: {},
                        };
                        event.previous[propertyName] = property;
                        event.new[propertyName] = newValue;
                        property = newValue;
                        if (onChange) {
                            onChange(layer, propertyName);
                        }
                        layer.dispatchEvent(event);
                    }
                },
            });
    }
};

function nodeCommandQueuePriorityFunction(node) {
    const dim = node.extent.dimensions();
    return dim.x * dim.y;
}

function refinementCommandCancellationFn(cmd) {
    if (!cmd.requester.parent || !cmd.requester.material) {
        return true;
    }
    if (cmd.force) {
        return false;
    }

    return !cmd.requester.material.visible;
}

// max retry loading before changing the status to definitiveError
const MAX_RETRY = 4;

/**
 * Base class of layers. Layers are components of {@link module:entities/Map~Map Maps}.
 * A layer type can be either `color` (such as satellite imagery or maps),
 * or `elevation` (to describe terrain elevation).
 *
 * Layer is normaly not directly instanciate,
 * {@link module:Core/layer/ColorLayer~ColorLayer ColorLayer} or
 * {@link module:Core/layer/ElevationLayer~ElevationLayer ElevationLayer} are used.
 *
 *     // Create a layer source
 *     var source = new giro3d.olsource.TileWMS({options});
 *
 *     // Add and create a new Layer to a map.
 *     const newLayer = ColorLayer(
 *         'myColorLayerId',
 *         {
 *             source: source,
 *             updateStrategy: {
 *                 type: giro3d.STRATEGY_DICHOTOMY,
 *             }
 *         }
 *     });
 *     map.addLayer(newLayer);
 *
 *     // Change layer's visibilty
 *     const layerToChange = map.getLayers(layer => layer.id === 'idLayerToChange')[0];
 *     layerToChange.visible = false;
 *     instance.notifyChange(); // update viewer
 *
 *     // Change layer's opacity
 *     const layerToChange = view.getLayers(layer => layer.id === 'idLayerToChange')[0];
 *     layerToChange.opacity = 0.5;
 *     instance.notifyChange(); // update viewer
 *
 *     // Listen to properties
 *     const layerToListen = map.getLayers(layer => layer.id === 'idLayerToListen')[0];
 *     layerToListen.addEventListener('visible-property-changed', (event) => console.log(event));
 *     layerToListen.addEventListener('opacity-property-changed', (event) => console.log(event));
 *
 * @api
 */
class Layer extends EventDispatcher {
    /**
     * Creates a layer. The method `update` should be set.
     * It should be added in {@link module:entities/Map~Map Maps} to be displayed in the instance.
     * See the example for more information on layer creation.
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
    constructor(id, options) {
        super();
        Object.defineProperty(this, 'id', {
            value: id,
            writable: false,
        });

        this.standalone = options.standalone ? options.standalone : false;

        // If the mode is standalone, no protocol is provided.
        // The update function should be manually set.
        if (!this.standalone) {
            // Temp patch. Currently, all protocols don't use source
            // (some use layer properties or entity properties).
            // But at the moment where all protocols use source,
            // we can remove protocol name and check the source type.
            this.source = options.source;
            switch (this.source.constructor) {
                case TileWMS:
                case Stamen:
                    this.protocol = 'oltile';
                    break;
                case Vector:
                    this.protocol = 'olvector';
                    break;
                case VectorTile:
                    this.protocol = 'olvectortile';
                    break;
                case CogSource:
                    this.protocol = 'cog';
                    break;
                case StaticSource:
                    this.protocol = 'static';
                    break;
                default:
                    throw Error('Unsupported OpenLayers source');
            }
        }

        this.extent = options.extent;

        if (options.updateStrategy) {
            this.updateStrategy = options.updateStrategy;
        } else {
            this.updateStrategy = {
                type: STRATEGY_MIN_NETWORK_TRAFFIC,
            };
        }

        this.projection = options.projection;
        this.backgroundColor = options.backgroundColor;
    }

    _preprocessLayer(map, instance) {
        if (this.standalone) {
            this.whenReady = Promise.resolve().then(() => {
                this.ready = true;
                return this;
            });
            return this;
        }

        this.provider = instance.mainLoop.scheduler.getProtocolProvider(this.protocol);

        if (this.provider) {
            if (this.provider.tileInsideLimit) {
                // TODO remove bind ?
                this.tileInsideLimit = this.provider.tileInsideLimit.bind(this.provider);
            }
            if (this.provider.getPossibleTextureImprovements) {
                this.getPossibleTextureImprovements = this.provider
                    .getPossibleTextureImprovements
                    .bind(this.provider);
            }
            if (this.provider.tileTextureCount) {
                this.tileTextureCount = this.provider.tileTextureCount.bind(this.provider);
            }
        }

        if (!this.whenReady) {
            let providerPreprocessing = Promise.resolve();
            if (this.provider && this.provider.preprocessDataLayer) {
                providerPreprocessing = this.provider.preprocessDataLayer(this);
                if (!(providerPreprocessing && providerPreprocessing.then)) {
                    providerPreprocessing = Promise.resolve();
                }
            }

            // the last promise in the chain must return the layer
            this.whenReady = providerPreprocessing.then(() => {
                this.ready = true;
                return this;
            });
        }
        return this;
    }

    /**
     * Performs the update of the layer. This method must be overwritten
     * for the layer to be displayed and updated.
     *
     * @param {module:Core/Context~Context} context the context
     * @param {module:Core/TileMesh~TileMesh} node the node to update
     * @param {module:entities/Map~Map} parent the map where the layers have been added
     * @param {boolean} [initOnly = false] if true, the update is stopped before the update command
     * there is only a check that the layer state is defined in the node.
     * @returns {null|Promise} null if the update is not done,
     * else, that succeeds if the update is made. Currently, only null is returned
     * since the method is empty.
     */
    // eslint-disable-next-line
    update(context, node, parent, initOnly = false) {return null;}

    /**
     * Cleans the layer from a map
     *
     * @param {module:entities/Map~Map} object The map where the layer is added
     * @api
     */
    // eslint-disable-next-line
    clean(object) {} // TODO
}

/**
 * Provides functions to modify imagery layers.
 *
 * @api
 */
class ImageryLayers {
    /**
     * Moves the layer to the new index. The ordering of the other layers don't change.
     * After the modification :
     * - the minimum sequence will always be `0`
     * - the maximum sequence will always be `layers.length - 1`
     *
     * @api
     * @param {Layer} layer the layer to move
     * @param {number} newIndex the new index
     * @param {*} imageryLayers the collection of imagery layers to update.
     */
    static moveLayerToIndex(layer, newIndex, imageryLayers) {
        newIndex = Math.min(newIndex, imageryLayers.length - 1);
        newIndex = Math.max(newIndex, 0);
        const oldIndex = layer.sequence;

        for (const imagery of imageryLayers) {
            if (imagery.id === layer.id) {
                // change index of specified layer
                imagery.sequence = newIndex;
            } else if (imagery.sequence > oldIndex && imagery.sequence <= newIndex) {
                // down all layers between the old index and new index (to compensate the deletion
                // of the old index)
                imagery.sequence--;
            } else if (imagery.sequence >= newIndex && imagery.sequence < oldIndex) {
                // up all layers between the new index and old index (to compensate the insertion of
                // the new index)
                imagery.sequence++;
            }
        }
    }

    /**
     * Moves the layer one step down.
     * If the layer is already at the bottom, nothing happens.
     *
     * @api
     * @param {Layer} layer the layer to move
     * @param {*} imageryLayers the collection of imagery layers to update.
     */
    static moveLayerDown(layer, imageryLayers) {
        if (layer.sequence > 0) {
            this.moveLayerToIndex(layer, layer.sequence - 1, imageryLayers);
        }
    }

    /**
     * Moves the layer one step up.
     * If the layer is already at the top, nothing happens.
     *
     * @api
     * @param {Layer} layer the layer to move
     * @param {*} imageryLayers the collection of imagery layers to update.
     */
    static moveLayerUp(layer, imageryLayers) {
        const m = imageryLayers.length - 1;
        if (layer.sequence < m) {
            this.moveLayerToIndex(layer, layer.sequence + 1, imageryLayers);
        }
    }

    /**
     * Gets the layers ordered by sequence (order in the hierarchy).
     *
     * @api
     * @param {Layer[]} imageryLayers the collection of imagery layers.
     * @returns {Array<Layer>} the ordered layers IDs
     */
    static getColorLayersIdOrderedBySequence(imageryLayers) {
        const copy = Array.from(imageryLayers);
        copy.sort((a, b) => a.sequence - b.sequence);
        return copy.map(l => l.id);
    }
}

export default Layer;
export {
    ImageryLayers, defineLayerProperty, nodeCommandQueuePriorityFunction,
    refinementCommandCancellationFn, MAX_RETRY,
};
