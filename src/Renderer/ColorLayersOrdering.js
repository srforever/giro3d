import { ImageryLayers } from '../Core/layer/Layer.js';
import ColorLayer from '../Core/layer/ColorLayer.js';

function updateLayersOrdering(entity, imageryLayers) {
    const sequence = ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers);
    const cO = function cO(object) {
        if (object.changeSequenceLayers) {
            object.changeSequenceLayers(sequence);
        }
    };

    for (const node of entity.level0Nodes) {
        node.traverse(cO);
    }
}

export const COLOR_LAYERS_ORDER_CHANGED = 'layers-order-changed';

// TODO move this logic into each geometryobject
export const ColorLayersOrdering = {
    /**
     * Moves up in the layer list. This function has no effect
     * if the layer is moved to its current index.
     *
     * @function moveLayerUp
     * @param      {module:Core/Instance~Instance} instance the giro3d instance
     * @param      {string}  layerId   The layer's idendifiant
     * @example
     * ColorLayersOrdering.moveLayerUp(viewer, 'idLayerToUp');
     */
    // TODO this should be done per Map / Entity3D, not for every color layers
    moveLayerUp: function moveLayerUp(instance, layerId) {
        // TODO should be in map
        const imageryLayers = instance.getLayers(l => l instanceof ColorLayer);
        const layer = instance.getLayers(l => l.id === layerId)[0];
        if (layer) {
            const previousSequence = ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers);
            ImageryLayers.moveLayerUp(layer, imageryLayers);
            updateLayersOrdering(instance.wgs84TileLayer, imageryLayers);
            instance.dispatchEvent({
                type: COLOR_LAYERS_ORDER_CHANGED,
                previous: { sequence: previousSequence },
                new: { sequence: ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers) },
            });
            instance.notifyChange(instance.wgs84TileLayer);
        } else {
            throw new Error(`${layerId} isn't color layer`);
        }
    },
    /**
     * Moves down in the layer list. This function has no effect if the layer is moved to its
     * current index.
     *
     * @function moveLayerDown
     * @param      {module:Core/Instance~Instance} instance the giro3d instance
     * @param      {string}  layerId   The layer's idendifiant
     * @example
     * ColorLayersOrdering.moveLayerDown(viewer, 'idLayerToDown');
     */
    moveLayerDown: function moveLayerDown(instance, layerId) {
        const imageryLayers = instance.getLayers(l => l instanceof ColorLayer);
        const layer = instance.getLayers(l => l.id === layerId)[0];
        if (layer) {
            const previousSequence = ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers);
            ImageryLayers.moveLayerDown(layer, imageryLayers);
            updateLayersOrdering(instance.wgs84TileLayer, imageryLayers);
            instance.dispatchEvent({
                type: COLOR_LAYERS_ORDER_CHANGED,
                previous: { sequence: previousSequence },
                new: { sequence: ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers) },
            });
            instance.notifyChange(instance.wgs84TileLayer);
        } else {
            throw new Error(`${layerId} isn't color layer`);
        }
    },
    /**
     * Moves a specific layer to a specific index in the layer list.
     * This function has no effect if the layer is moved to its current index.
     *
     * @function moveLayerToIndex
     * @param      {module:Core/Instance~Instance} instance the giro3d instance
     * @param      {string}  layerId   The layer's idendifiant
     * @param      {number}  newIndex   The new index
     * @example
     * ColorLayersOrdering.moveLayerToIndex(viewer, 'idLayerToChangeIndex', 2);
     */
    moveLayerToIndex: function moveLayerToIndex(instance, layerId, newIndex) {
        const imageryLayers = instance.getLayers(l => l instanceof ColorLayer);
        const layer = instance.getLayers(l => l.id === layerId)[0];
        if (layer) {
            const previousSequence = ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers);
            ImageryLayers.moveLayerToIndex(layer, newIndex, imageryLayers);
            updateLayersOrdering(instance.wgs84TileLayer, imageryLayers);
            instance.dispatchEvent({
                type: COLOR_LAYERS_ORDER_CHANGED,
                previous: { sequence: previousSequence },
                new: { sequence: ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers) },
            });
            instance.notifyChange(instance.wgs84TileLayer);
        } else {
            throw new Error(`${layerId} isn't color layer`);
        }
    },
};
