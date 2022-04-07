import LayerUpdateState from '../Core/Layer/LayerUpdateState.js';
import CancelledCommandException from '../Core/Scheduler/CancelledCommandException.js';

export const ELEVATION_FORMAT = {
    MAPBOX_RGB: 0,
    HEIGHFIELD: 1,
    XBIL: 2,
    RATP_GEOL: 3,
};

// max retry loading before changing the status to definitiveError
const MAX_RETRY = 4;

function tr(r, g, b) {
    return -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;
}

// get image data
let fooCanvas;
function colorImageSetup(texture) {
    if (!fooCanvas) {
        fooCanvas = document.createElement('canvas');
        fooCanvas.width = 256;
        fooCanvas.height = 256;
    }
    const w = texture.image.width;
    const h = texture.image.height;
    const fooCtx = fooCanvas.getContext('2d');
    fooCanvas.width = w;
    fooCanvas.height = h;
    fooCtx.drawImage(texture.image, 0, 0);
    const { data } = fooCtx.getImageData(0, 0, w, h);
    const stride = w * 4;
    return { data, stride, h };
}

export function minMaxFromTexture(layer, texture) {
    if (texture.min != null && texture.max != null) {
        return {
            min: texture.min,
            max: texture.max,
        };
    }

    let min = Infinity;
    let max = -Infinity;
    if (layer.elevationFormat === ELEVATION_FORMAT.MAPBOX_RGB) {
        const { data, stride, h } = colorImageSetup(texture);
        for (let i = 0; i < h; i++) {
            for (let j = 0; j < stride; j += 4) {
                const val = tr(
                    data[i * stride + j],
                    data[i * stride + j + 1],
                    data[i * stride + j + 2],
                );
                if (val < min) {
                    min = val;
                }
                if (val > max) {
                    max = val;
                }
            }
        }
    } else if (layer.elevationFormat === ELEVATION_FORMAT.HEIGHFIELD) {
        const { data, stride, h } = colorImageSetup(texture);
        for (let i = 0; i < h; i++) {
            for (let j = 0; j < stride; j += 4) {
                min = Math.min(min, data[i * stride + j]);
                max = Math.max(max, data[i * stride + j]);
            }
        }
        min = layer.heightFieldOffset + layer.heightFieldScale * (min / 255);
        max = layer.heightFieldOffset + layer.heightFieldScale * (max / 255);
    } else if (layer.elevationFormat === ELEVATION_FORMAT.XBIL) {
        for (let i = 0; i < texture.image.data.length; i++) {
            const val = texture.image.data[i];
            if (val > -1000) {
                min = Math.min(min, val);
                max = Math.max(max, val);
            }
        }
    } else if (layer.elevationFormat === ELEVATION_FORMAT.RATP_GEOL) {
        // TODO
        min = -1000;
        max = 1000;
    } else {
        throw new Error(`Unsupported layer.elevationFormat "${layer.elevationFormat}'`);
    }

    texture.min = min;
    texture.max = max;
    return { min, max };
}

function initNodeElevationTextureFromParent(node, parent, layer) {
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

    let { min, max } = parentTexture;
    if (!min || !max) {
        ({ min, max } = minMaxFromTexture(layer, parentTexture, pitch));
    }
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
        const { material } = node;

        if (!node.parent || !material) {
            return null;
        }

        // TODO: we need either
        //  - compound or exclusive layers
        //  - support for multiple elevation layers

        // Initialisation
        if (node.layerUpdateState[layer.id] === undefined) {
            node.layerUpdateState[layer.id] = new LayerUpdateState();

            if (parent
                && parent.material
                && initNodeElevationTextureFromParent(node, parent, layer)) {
                context.view.notifyChange(node, false);
                return null;
            }
        }

        // Try to update
        const ts = Date.now();

        // Possible conditions to *not* update the elevation texture
        if (initOnly
                || layer.frozen
                || !node.material.visible
                || !node.layerUpdateState[layer.id].canTryUpdate(ts)) {
            return null;
        }

        // Does this tile needs a new texture?
        const nextDownloads = layer.getPossibleTextureImprovements(
            layer,
            node.getExtentForLayer(layer),
            node.material.getLayerTexture(layer).texture,
            node.layerUpdateState[layer.id].failureParams,
        );

        if (!nextDownloads) {
            node.layerUpdateState[layer.id].noMoreUpdatePossible();
            return null;
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
                    return null;
                }
                // We currently only support a single elevation texture
                if (Array.isArray(result)) {
                    result = result[0];
                }
                return result;
            },
            err => {
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
            },
        ).then(elevation => {
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
