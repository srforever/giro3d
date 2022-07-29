/**
 * @module Core/Layer/Layer
 */
import { EventDispatcher } from 'three';

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

export const defineLayerProperty = function defineLayerProperty(layer,
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

/**
 * Layers are components of {@link module:entities/Map~Map Maps}.
 * A layer type can be either `color` (such as satellite imagery or maps),
 * or `elevation` (to describe terrain elevation).
 *
 * Layer objects are not directly added to the map, but returned with
 * {@link module:entities/Map~Map#addLayer addLayer()}.
 *
 *     import TileWMS from 'ol/source/TileWMS.js';
 *
 *     // Create a layer source
 *     var source = new TileWMS({options});
 *
 *     // Add and create a new Layer to a map.
 *     const newLayer = map.addLayer({
 *         id: 'myColorLayer',
 *         type: 'color',
 *         protocol: 'oltile',
 *         source: source,
 *         updateStrategy: {
 *             type: STRATEGY_DICHOTOMY,
 *             options: {},
 *         }
 *     });
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
     * **Internal use only**. To create a layer,
     * use {@link module:entities/Map~Map#addLayer Map.addLayer()}.
     * See the example for more information on layer creation.
     *
     * @protected
     * @param      {string}  id the unique identifier of the layer
     */
    constructor(id) {
        super();
        Object.defineProperty(this, 'id', {
            value: id,
            writable: false,
        });
    }
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
export { ImageryLayers };
