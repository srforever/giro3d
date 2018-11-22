import LayerUpdateState from '../Core/Layer/LayerUpdateState';
import CancelledCommandException from '../Core/Scheduler/CancelledCommandException';

const MAX_RETRY = 4;

function initColorTexturesFromParent(node, parent, layer) {
    if (!parent.material || !parent.material.getLayerTexture) {
        return false;
    }

    const extent = node.getExtentForLayer(layer);
    const parentTexture = parent.material.getLayerTexture(layer);
    if (!parentTexture) {
        return false;
    }

    const texture = parentTexture.texture;

    if (!texture || !texture.extent) {
        return false;
    }
    if (extent.isInside(texture.extent, texture.extent.dimensions().x * 0.001)) {
        node.material.setLayerTextures(layer, [{
            texture,
            pitch: extent.offsetToParent(texture.extent),
        }]);
        return true;
    }

    return false;
}

function nodeCommandQueuePriorityFunction(node) {
    // We know that 'node' is visible because commands can only be
    // issued for visible nodes.

    // TODO: need priorization of displayed nodes
    if (node.material.visible) {
        // Then prefer displayed() node over non-displayed one
        return 100;
    } else {
        return 10;
    }
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


export default {
    updateLayerElement(context, layer, node, parent) {
        const material = node.material;

        if (!node.parent || !material) {
            return;
        }

        // Initialisation
        if (node.layerUpdateState[layer.id] === undefined) {
            node.layerUpdateState[layer.id] = new LayerUpdateState();

            if (!layer.tileInsideLimit(node, layer)) {
                // we also need to check that tile's parent doesn't have a texture for this layer,
                // because even if this tile is outside of the layer, it could inherit it's
                // parent texture
                if (!layer.noTextureParentOutsideLimit &&
                    parent &&
                    parent.material &&
                    parent.material.getLayerTexture(layer)) {
                    // ok, we're going to inherit our parent's texture
                } else {
                    node.layerUpdateState[layer.id].noMoreUpdatePossible();
                    return;
                }
            }

            // INIT TEXTURE
            material.pushLayer(layer, node.getExtentForLayer(layer));

            if (parent && initColorTexturesFromParent(node, parent, layer)) {
                context.view.notifyChange(node, false);
                return;
            }
        }

        // Node is hidden, no need to update it
        if (!node.material.visible) {
            return;
        }

        // TODO: move this to defineLayerProperty() declaration
        // to avoid mixing layer's network updates and layer's params
        // Update material parameters
        material.setLayerVisibility(layer, layer.visible);
        material.setLayerOpacity(layer, layer.opacity);

        const ts = Date.now();
        // An update is pending / or impossible -> abort
        if (layer.frozen || !layer.visible || !node.layerUpdateState[layer.id].canTryUpdate(ts)) {
            return;
        }

        // Does this tile needs a new texture?
        const nextDownloads = layer.canTextureBeImproved(
            layer,
            node.getExtentForLayer(layer),
            node.material.getLayerTexture(layer).texture,
            node.layerUpdateState[layer.id].failureParams);

        // if the provider returns false/undef, then we konw it will never have any texture
        if (!nextDownloads) {
            node.layerUpdateState[layer.id].noMoreUpdatePossible();
            return;
        }
        // in this case, the layer might be able to provide a texture later
        if (nextDownloads.length == 0) {
            return;
        }

        node.layerUpdateState[layer.id].newTry();
        const command = {
            /* mandatory */
            view: context.view,
            layer,
            requester: node,
            priority: nodeCommandQueuePriorityFunction(node),
            earlyDropFunction: refinementCommandCancellationFn,
            toDownload: nextDownloads,
        };

        return context.scheduler.execute(command).then(
            (result) => {
                if (node.material === null) {
                    return;
                }

                node.material.setLayerTextures(layer, result);
                node.layerUpdateState[layer.id].success();

                return result;
            },
            (err) => {
                if (err instanceof CancelledCommandException) {
                    node.layerUpdateState[layer.id].success();
                } else {
                    console.warn('Imagery texture update error for', node, err);
                    const definitiveError = node.layerUpdateState[layer.id].errorCount > MAX_RETRY;
                    node.layerUpdateState[layer.id].failure(Date.now(), definitiveError, err);
                    if (!definitiveError) {
                        window.setTimeout(() => {
                            context.view.notifyChange(node, false);
                        }, node.layerUpdateState[layer.id].secondsUntilNextTry() * 1000);
                    }
                }
            });
    },
};

