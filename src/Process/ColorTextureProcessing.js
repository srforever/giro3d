import LayerUpdateState from '../Core/Layer/LayerUpdateState';
import CancelledCommandException from '../Core/Scheduler/CancelledCommandException';

const MAX_RETRY = 4;

function initColorTexturesFromParent(context, node, parent, layer) {
    if (!parent.material || !parent.material.getLayerTexture) {
        return false;
    }

    const extent = node.getExtentForLayer(layer);
    // move up until we have a parent that uses its own atlas
    // This is needed because otherwise we'll get inconsistencies: child will inherit the atlas,
    // but will compute its offset/scale values based on the result of parent.material.getLayerTexture()
    while (parent && parent.material && parent.material.uniforms.colorTexture.value != parent.material.texturesInfo.color.atlasTexture) {
        parent = parent.parent;
    }
    if (!parent || !parent.material) {
        return false;
    }
    const parentTexture = parent.material.getLayerTexture(layer);
    if (!parentTexture) {
        return false;
    }

    const texture = parentTexture.texture;

    if (!texture || !texture.extent) {
        return false;
    }

    node.material.setLayerTextures(layer, {
        texture,
        pitch: extent.offsetToParent(texture.extent),
    }, true, context.view);
    return true;
}

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


export default {
    cleanLayer(view, layer, parentLayer) {
        parentLayer.object3d.traverse(o => {
            if (o.layer === parentLayer) {
                // clean object of layer
                delete o.layerUpdateState[layer.id];
                // delete texture in material
                // it's possible not to have this layer in this particular Mesh, see `updateLayerElement`
                if (o.material && o.material.indexOfColorLayer(layer) !== -1) {
                    o.material.removeLayer(layer);
                }
            }
        });
    },
    updateLayerElement(context, layer, node, parent, initOnly = false) {
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

            if (parent && initColorTexturesFromParent(context, node, parent, layer)) {
                context.view.notifyChange(node, false);
                return;
            }
        }

        // Node is hidden, no need to update it
        if (!node.material.visible || initOnly) {
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
        const existing = node.material.getLayerTexture(layer);
        const nextDownloads = layer.canTextureBeImproved(
            layer,
            node.getExtentForLayer(layer),
            existing ? existing.texture : null,
            node.layerUpdateState[layer.id].failureParams);

        // if the provider returns undef, then we konw it will never have any texture
        if (nextDownloads === undefined) {
            node.layerUpdateState[layer.id].noMoreUpdatePossible();
            return;
        }
        // in this case, the layer might be able to provide a texture later
        if (nextDownloads === null) {
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
            result => {
                if (node.material === null) {
                    return;
                }

                return node.material.setLayerTextures(layer, result, false, context.view).then(() => {
                    node.layerUpdateState[layer.id].success();
                });
            },
            err => {
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

