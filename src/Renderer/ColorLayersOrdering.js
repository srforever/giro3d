import { ImageryLayers } from '../Core/Layer/Layer.js';
import Instance from '../Core/Instance.js';

function updateLayersOrdering(geometryLayer, imageryLayers) {
    const sequence = ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers);
    const cO = function cO(object) {
        if (object.changeSequenceLayers) {
            object.changeSequenceLayers(sequence);
        }
    };

    for (const node of geometryLayer.level0Nodes) {
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
     * @param      {Instance}  view the viewer
     * @param      {string}  layerId   The layer's idendifiant
     * @example
     * giro3d.ColorLayersOrdering.moveLayerUp(viewer, 'idLayerToUp');
     */
    // TODO this should be done per Map / GeometryLayer, not for every color layers
    moveLayerUp: function moveLayerUp(view, layerId) {
        // TODO should be in map
        const imageryLayers = view.getLayers(l => l.type === 'color');
        const layer = view.getLayers(l => l.id === layerId)[0];
        if (layer) {
            const previousSequence = ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers);
            ImageryLayers.moveLayerUp(layer, imageryLayers);
            updateLayersOrdering(view.wgs84TileLayer, imageryLayers);
            view.dispatchEvent({
                type: COLOR_LAYERS_ORDER_CHANGED,
                previous: { sequence: previousSequence },
                new: { sequence: ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers) },
            });
            view.notifyChange(view.wgs84TileLayer);
        } else {
            throw new Error(`${layerId} isn't color layer`);
        }
    },
    /**
     * Moves down in the layer list. This function has no effect if the layer is moved to its
     * current index.
     *
     * @function moveLayerDown
     * @param      {Instance}  view the viewer
     * @param      {string}  layerId   The layer's idendifiant
     * @example
     * giro3d.ColorLayersOrdering.moveLayerDown(viewer, 'idLayerToDown');
     */
    moveLayerDown: function moveLayerDown(view, layerId) {
        const imageryLayers = view.getLayers(l => l.type === 'color');
        const layer = view.getLayers(l => l.id === layerId)[0];
        if (layer) {
            const previousSequence = ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers);
            ImageryLayers.moveLayerDown(layer, imageryLayers);
            updateLayersOrdering(view.wgs84TileLayer, imageryLayers);
            view.dispatchEvent({
                type: COLOR_LAYERS_ORDER_CHANGED,
                previous: { sequence: previousSequence },
                new: { sequence: ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers) },
            });
            view.notifyChange(view.wgs84TileLayer);
        } else {
            throw new Error(`${layerId} isn't color layer`);
        }
    },
    /**
     * Moves a specific layer to a specific index in the layer list.
     * This function has no effect if the layer is moved to its current index.
     *
     * @function moveLayerToIndex
     * @param      {Instance}  view the viewer
     * @param      {string}  layerId   The layer's idendifiant
     * @param      {number}  newIndex   The new index
     * @example
     * giro3d.ColorLayersOrdering.moveLayerToIndex(viewer, 'idLayerToChangeIndex', 2);
     */
    moveLayerToIndex: function moveLayerToIndex(view, layerId, newIndex) {
        const imageryLayers = view.getLayers(l => l.type === 'color');
        const layer = view.getLayers(l => l.id === layerId)[0];
        if (layer) {
            const previousSequence = ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers);
            ImageryLayers.moveLayerToIndex(layer, newIndex, imageryLayers);
            updateLayersOrdering(view.wgs84TileLayer, imageryLayers);
            view.dispatchEvent({
                type: COLOR_LAYERS_ORDER_CHANGED,
                previous: { sequence: previousSequence },
                new: { sequence: ImageryLayers.getColorLayersIdOrderedBySequence(imageryLayers) },
            });
            view.notifyChange(view.wgs84TileLayer);
        } else {
            throw new Error(`${layerId} isn't color layer`);
        }
    },
};
