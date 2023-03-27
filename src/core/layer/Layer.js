/**
 * @module core/layer/Layer
 */
import { EventDispatcher } from 'three';

import Vector from 'ol/source/Vector.js';
import VectorTile from 'ol/source/VectorTile.js';
import TileImage from 'ol/source/TileImage.js';

import { STRATEGY_MIN_NETWORK_TRAFFIC } from './LayerUpdateStrategy.js';
import CogSource from '../../sources/CogSource.js';
import CustomTiledImageSource from '../../sources/CustomTiledImageSource.js';
import ColorMap from './ColorMap.js';
import Interpretation from './Interpretation.js';
import Extent from '../geographic/Extent.js';
import CustomTiledImageProvider from '../../provider/CustomTiledImageProvider.js';
import OLTileProvider from '../../provider/OLTileProvider.js';
import OLVectorTileProvider from '../../provider/OLVectorTileProvider.js';
import OLVectorProvider from '../../provider/OLVectorProvider.js';
import COGProvider from '../../provider/COGProvider.js';
import EventUtils from '../../utils/EventUtils.js';
import OperationCounter from '../OperationCounter.js';

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
 * Base class of layers. Layers are components of {@link module:entities/Map~Map Maps}.
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
 *         'myColorLayerId',
 *         {
 *             source: source,
 *             updateStrategy: {
 *                 type: STRATEGY_DICHOTOMY,
 *             }
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
     * @param {
     * TileImage |
     * Vector |
     * VectorTile |
     * CogSource |
     * CustomTiledImageSource
     * } options.source The data source of this layer.
     * @param {Extent} [options.extent=undefined] The geographic extent of the layer. If
     * unspecified, the extent will be inherited from the map.
     * @param {Interpretation} [options.interpretation=Interpretation.Raw] How to interpret the
     * values in the dataset.
     * @param {string} [options.projection=undefined] The layer projection. If unspecified,
     * the projection will be inherited from the map.
     * @param {object} [options.updateStrategy=undefined] The strategy to load new tiles.
     * If unspecified, the layer will use the `STRATEGY_MIN_NETWORK_TRAFFIC`.
     * @param {string} [options.backgroundColor=undefined] The background color of the layer.
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

        this.type = 'Layer';
        /** @type {Interpretation} */
        this.interpretation = options.interpretation ?? Interpretation.Raw;
        this.standalone = options.standalone ? options.standalone : false;

        EventUtils.definePropertyWithChangeEvent(this, 'visible', true);
        this.frozen = false;

        this._opCounter = new OperationCounter();

        if (options.colorMap !== undefined) {
            /** @type {ColorMap} */
            this.colorMap = options.colorMap;
        }

        // If the mode is standalone, no provider is provided.
        // The update function should be manually set.
        if (!this.standalone) {
            this.source = options.source;
            if (this.source instanceof TileImage) {
                this.provider = OLTileProvider;
            } else if (this.source instanceof VectorTile) {
                this.provider = OLVectorTileProvider;
            } else if (this.source instanceof Vector) {
                this.provider = OLVectorProvider;
            } else if (this.source instanceof CogSource) {
                this.provider = COGProvider;
            } else if (this.source instanceof CustomTiledImageSource) {
                this.provider = CustomTiledImageProvider;
            } else {
                throw Error('Unsupported OpenLayers source');
            }
        }

        /** @type {Extent} */
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

    /**
     * Gets whether this layer is currently loading data.
     *
     * @api
     * @type {boolean}
     */
    get loading() {
        return this._opCounter.loading;
    }

    /**
     * Gets the progress value of the data loading.
     *
     * @api
     * @type {boolean}
     */
    get progress() {
        return this._opCounter.progress;
    }

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    _customPreprocessLayer(map, instance) {
        // Implement this in derived classes
        return Promise.resolve(this);
    }

    _preprocessLayer(map, instance) {
        if (this.standalone) {
            this.whenReady = Promise.resolve().then(() => {
                this.ready = true;
                return this;
            });
            return this;
        }

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
            this.whenReady = providerPreprocessing
                .then(() => this._customPreprocessLayer(map, instance))
                .then(() => {
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
     * Disposes the layer.
     *
     * @param {module:entities/Map~Map} map The map where the layer is added
     */
    // eslint-disable-next-line
    dispose(map) {
        this.colorMap?.dispose();
    }
}

export default Layer;
export {
    nodeCommandQueuePriorityFunction,
    refinementCommandCancellationFn, MAX_RETRY,
};
