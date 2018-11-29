import LayerUpdateState from '../Core/Layer/LayerUpdateState';
import CancelledCommandException from '../Core/Scheduler/CancelledCommandException';
import { SIZE_TEXTURE_TILE } from '../Provider/OGCWebServiceHelper';

export const ELEVATION_FORMAT = {
    MAPBOX_RGB: 0,
    HEIGHFIELD: 1,
};

// max retry loading before changing the status to definitiveError
const MAX_RETRY = 4;

const fooCanvas = document.createElement('canvas');
fooCanvas.width = 256;
fooCanvas.height = 256;

export function minMaxFromTexture(layer, texture, pitch) {
    if (pitch.z == 1.0 && pitch.w == 1.0 && texture.min != undefined && texture.max != undefined) {
        return { min: texture.min, max: texture.max };
    }

    const w = Math.round(texture.image.width * pitch.z);
    const h = Math.round(texture.image.height * pitch.w);

    if (w == 0 || h == 0) {
        return { min: texture.min, max: texture.max };
    }
    const fooCtx = fooCanvas.getContext('2d');
    fooCanvas.width = w;
    fooCanvas.height = h;
    // y-offset is from bottom-left of the image
    fooCtx.drawImage(
        texture.image,
        texture.image.width * pitch.x,
        texture.image.height - texture.image.height * pitch.y - h,
        w, h,
        0, 0, w, h);
    const data = fooCtx.getImageData(0, 0, w, h).data;
    const stride = w * 4;

    let min = Infinity;
    let max = -Infinity;
    if (layer.format == ELEVATION_FORMAT.MAPBOX_RGB) {
        function tr(r, g, b) {
            return -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;
        }

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
    } else if (layer.format == ELEVATION_FORMAT.HEIGHFIELD) {
        for (let i = 0; i < h; i++) {
            for (let j = 0; j < stride; j += 4) {
                min = Math.min(min, data[i * stride + j])
                max = Math.max(max, data[i * stride + j])
            }
        }
    } else {
        throw new Error('Unsupported layer.format "' + layer.format + "'");
    }

    if (pitch.z == 1.0 && pitch.w == 1.0) {
        texture.min = min;
        texture.max = max;
    }
    return { min, max };
}


function initNodeElevationTextureFromParent(node, parent, layer) {
    const nodeTexture = node.material.getLayerTexture(layer).texture;
    const parentTexture = parent.material.getLayerTexture(layer).texture;
    if (!parentTexture.extent) {
        return;
    }

    const extent = node.getExtentForLayer(layer);

    const pitch = extent.offsetToParent(parentTexture.extent);
    const elevation = {
        texture: parentTexture,
        pitch,
    };

    const { min, max } = minMaxFromTexture(layer, parentTexture, pitch);
    elevation.min = min;
    elevation.max = max;

    node.setTextureElevation(layer, elevation);
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
    updateLayerElement(context, layer, node, parent, initOnly = false) {
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
        if (initOnly ||
                layer.frozen ||
                !node.material.visible ||
                !node.layerUpdateState[layer.id].canTryUpdate(ts)) {
            return;
        }

        // Does this tile needs a new texture?
        const nextDownloads = layer.canTextureBeImproved(
            layer,
            node.getExtentForLayer(layer),
            node.material.getLayerTexture(layer).texture,
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
                return result;
            },
            (err) => {
                if (err instanceof CancelledCommandException) {
                    node.layerUpdateState[layer.id].success();
                } else {
                    console.warn('Elevation texture update error for', node, err);
                    const definitiveError = node.layerUpdateState[layer.id].errorCount > MAX_RETRY;
                    node.layerUpdateState[layer.id].failure(Date.now(), definitiveError, err);
                    if (!definitiveError) {
                        window.setTimeout(() => {
                            context.view.notifyChange(node, false);
                        }, node.layerUpdateState[layer.id].secondsUntilNextTry() * 1000);
                    }
                }
            }).then((elevation) => {
                if (!elevation) {
                    return;
                }
                const { min, max } = minMaxFromTexture(layer, elevation.texture, elevation.pitch);
                elevation.min = min;
                elevation.max = max;

                node.setTextureElevation(layer, elevation);
                node.layerUpdateState[layer.id].success();
            });
    },
};
