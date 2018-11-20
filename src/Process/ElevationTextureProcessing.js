import LayerUpdateState from '../Core/Layer/LayerUpdateState';
import CancelledCommandException from '../Core/Scheduler/CancelledCommandException';
import { SIZE_TEXTURE_TILE } from '../Provider/OGCWebServiceHelper';
import { computeMinMaxElevation } from '../Parser/XbilParser';

// max retry loading before changing the status to definitiveError
const MAX_RETRY = 4;

const fooCanvas = document.createElement('canvas');
fooCanvas.width = 256;
fooCanvas.height = 256;


function initNodeElevationTextureFromParent(node, parent, layer) {
    // Inherit parent's elevation texture. Note that contrary to color layers the elevation level of the
    // node might not be EMPTY_TEXTURE_ZOOM in this init function. That's because we can have
    // multiple elevation layers (thus multiple calls to initNodeElevationTextureFromParent) but a given
    // node can only use 1 elevation texture
    const nodeTexture = node.material.getLayerTexture(layer).texture;
    const parentTexture = parent.material.getLayerTexture(layer).texture;
    if (!parentTexture.extent) {
        return;
    }
    if (!nodeTexture.extent || parentTexture.extent.isInside(nodeTexture.extent)) {
        const extent = node.getExtentForLayer(layer);

        const pitch = extent.offsetToParent(parentTexture.extent);
        const elevation = {
            texture: parentTexture,
            pitch,
        };

        const { min, max } = computeMinMaxElevation(
            parentTexture.image.data,
            SIZE_TEXTURE_TILE, SIZE_TEXTURE_TILE,
            pitch);
        elevation.min = min;
        elevation.max = max;

        node.setTextureElevation(layer, elevation);
    }
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

        // TODO: we need either
        //  - compound or exclusive layers
        //  - support for multiple elevation layers

        // Initialisation
        if (node.layerUpdateState[layer.id] === undefined) {
            node.layerUpdateState[layer.id] = new LayerUpdateState();

            if (parent && parent.material && initNodeElevationTextureFromParent(node, parent, layer)) {
                context.view.notifyChange(node, false);
                return;
            }
        }

        // Try to update
        const ts = Date.now();

        // Possible conditions to *not* update the elevation texture
        if (layer.frozen ||
                !node.material.visible ||
                !node.layerUpdateState[layer.id].canTryUpdate(ts)) {
            return;
        }

        // Does this tile needs a new texture?
        const nextDownloads = layer.canTextureBeImproved(
            layer,
            node.getExtentForLayer(layer),
            node.material.getLayerTexture(layer).textures,
            node.layerUpdateState[layer.id].failureParams);

        if (!nextDownloads) {
            node.layerUpdateState[layer.id].noMoreUpdatePossible();
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

                // We currently only support a single elevation texture
                if (Array.isArray(result)) {
                    result = result[0];
                }

                const currentTexture = node.material.getLayerTexture(layer).texture;
                if (currentTexture.extent) {
                    // Cancel update if current texture extent is <= new texture
                    if (currentTexture.extent.isInside(result.texture.extent)) {
                        return;
                    }
                }
                return result;
            },
            (err) => {
                if (err instanceof CancelledCommandException) {
                    node.layerUpdateState[layer.id].success();
                } else {
                    if (__DEBUG__) {
                        console.warn('Elevation texture update error for', node, err);
                    }
                    const definitiveError = node.layerUpdateState[layer.id].errorCount > MAX_RETRY;
                    node.layerUpdateState[layer.id].failure(Date.now(), definitiveError, err);
                    if (!definitiveError) {
                        window.setTimeout(() => {
                            context.view.notifyChange(node, false);
                        }, node.layerUpdateState[layer.id].secondsUntilNextTry() * 1000);
                    }
                }
            }).then((terrain) => {
                if (!terrain) {
                    return;
                }
                if (terrain.texture && terrain.texture.flipY) {
                    // DataTexture default to false, so make sure other Texture types
                    // do the same (eg image texture)
                    // See UV construction for more details
                    terrain.texture.flipY = false;
                    terrain.texture.needsUpdate = true;
                }

                // TODO do xbil specific processing here, instead of doing it
                // early in OGCWebServiceHelper
                return terrain;
            }).then((texture) => {
                if (!texture) { return; }

                // mapbox elevation
                const w = texture.texture.image.width * texture.pitch.z;
                const h = texture.texture.image.height * texture.pitch.w;
                const fooCtx = fooCanvas.getContext('2d');
                fooCanvas.width = 256;
                fooCanvas.height = 256;
                fooCtx.drawImage(
                    texture.texture.image,
                    texture.texture.image.width * texture.pitch.x,
                    texture.texture.image.height * texture.pitch.y,
                    w, h,
                    0, 0, w, h);
                const data = fooCtx.getImageData(0, 0, w, h).data;
                function tr(r, g, b) {
                    return -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;
                }

                let min = Infinity;
                let max = -Infinity;
                const stride = w * 4;
                for (let i = 0; i < h; i++) {
                    for (let j = 0; j < stride; j += 4) {
                        const val = tr(
                            data[i * stride + j],
                            data[i * stride + j + 1],
                            data[i * stride + j + 2]);
                        if (val < min) {
                            min = val;
                        }
                        if (val > max) {
                            max = val;
                        }
                    }
                }
                texture.min = min;
                texture.max = max;

                // texture.texture.wrapS = MirroredRepeatWrapping;
                // texture.texture.wrapT = MirroredRepeatWrapping;
                // texture.texture.needsUpdate = true;
                node.setTextureElevation(layer, texture);
                node.layerUpdateState[layer.id].success();
            });
    },
};
