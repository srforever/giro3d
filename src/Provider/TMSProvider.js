import * as THREE from 'three';
import OGCWebServiceHelper from './OGCWebServiceHelper.js';
import URLBuilder from './URLBuilder.js';
import Extent from '../Core/Geographic/Extent.js';
import VectorTileHelper from './VectorTileHelper.js';
import { STRATEGY_MIN_NETWORK_TRAFFIC, STRATEGY_PROGRESSIVE, STRATEGY_DICHOTOMY, STRATEGY_GROUP } from '../Core/Layer/LayerUpdateStrategy.js';

function preprocessDataLayer(layer) {
    if (!layer.extent) {
        // default to the full 3857 extent
        layer.extent = new Extent('EPSG:3857',
            -20037508.342789244, 20037508.342789244,
            -20037508.342789244, 20037508.342789244);
    }
    if (!(layer.extent instanceof (Extent))) {
        if (!layer.projection) {
            throw new Error(`Missing projection property for layer '${layer.id}'`);
        }
        layer.extent = new Extent(layer.projection, ...layer.extent);
    }
    layer.origin = layer.origin || (layer.protocol === 'xyz' ? 'top' : 'bottom');
    if (!layer.options.zoom) {
        layer.options.zoom = {
            min: 0,
            max: 18,
        };
    }
    layer.fx = layer.fx || 0.0;
}

// Maps nodeLevel to groups defined in layer's options
// eg with groups = [3, 7, 12]:
//     * nodeLevel = 2 -> 3
//     * nodeLevel = 4 -> 3
//     * nodeLevel = 7 -> 7
//     * nodeLevel = 15 -> 12
function _group(nodeLevel, currentLevel, options) {
    const f = options.groups.filter(val => (val <= nodeLevel));
    return f.length ? f[f.length - 1] : options.groups[0];
}

function chooseExtentToDownload(extent, currentExtent, layer, pitch, previousError) {
    if (layer.updateStrategy.type === STRATEGY_MIN_NETWORK_TRAFFIC) {
        return extent;
    }

    let nextZoom = 0;
    if (currentExtent) {
        if (extent.zoom <= (currentExtent.zoom + 1)) {
            return extent;
        }

        switch (layer.updateStrategy.type) {
            case STRATEGY_PROGRESSIVE:
                nextZoom += 1;
                break;
            case STRATEGY_GROUP:
                nextZoom = _group(extent.zoom, currentExtent.zoom, layer.updateStrategy.options);
                break;
            default:
            case STRATEGY_DICHOTOMY:
                nextZoom = Math.ceil((currentExtent.zoom + extent.zoom) / 2);
                break;
        }
    }

    if (previousError && previousError.extent && previousError.extent.zoom === nextZoom) {
        nextZoom = Math.ceil((currentExtent.zoom + nextZoom) / 2);
    }

    nextZoom = Math.min(
        Math.max(nextZoom, layer.options.zoom.min),
        layer.options.zoom.max);

    if (extent.zoom <= nextZoom) {
        return extent;
    }

    return OGCWebServiceHelper.WMTS_WGS84Parent(extent, nextZoom, pitch);
}

function canTextureBeImproved(layer, extent, texture, previousError) {
    if (!extentInsideLimit(extent, layer)) {
        return false;
    }
    if (extent.zoom > layer.options.zoom.max) {
        return false;
    }

    if (!texture) {
        return selectAllExtentsToDownload(layer, extent, texture, previousError);
    }

    if (!texture.extent || texture.extent.zoom < extent.zoom) {
        return selectAllExtentsToDownload(layer, extent, texture, previousError);
    }
    return false;
}

function selectAllExtentsToDownload(layer, extent_, texture, previousError) {
    const pitch = new THREE.Vector4(0, 0, 1, 1);
    const extent = chooseExtentToDownload(
        extent_,
        (texture && texture.extent) ? texture.extent : null,
        layer,
        pitch,
        previousError);

    // if the choice is the same as the current one => stop updating
    if (texture && texture.extent && texture.extent.zoom === extent.zoom) {
        return null;
    }
    return {
        extent,
        pitch,
        url: URLBuilder.xyz(extent, layer),
    };
}

function executeCommand(command) {
    const layer = command.layer;

    const promise = layer.format === 'application/x-protobuf;type=mapbox-vector' ?
        VectorTileHelper.getVectorTileTextureByUrl(command.toDownload, command.requester, layer/* , todo.extent */) :
        OGCWebServiceHelper.getColorTextureByUrl(command.toDownload, layer.networkOptions);

    return promise.then(texture => {
        const result = {};
        result.texture = texture;
        // result.texture.extent = todo.extent;
        // result.pitch = todo.pitch;
        if (layer.transparent) {
            texture.premultiplyAlpha = true;
        }
        return result;
    });
}

function tileTextureCount(tile, layer) {
    return tileInsideLimit(tile, layer) ? 1 : 0;
}

function tileInsideLimit(tile, layer) {
    // assume 1 TMS texture per tile (ie: tile geometry CRS is the same as layer's CRS)
    return extentInsideLimit(tile.getExtentForLayer(layer), layer);
}

function extentInsideLimit(extent, layer) {
    return layer.options.zoom.min <= extent.zoom &&
            extent.zoom <= layer.options.zoom.max;
}

export default {
    preprocessDataLayer,
    executeCommand,
    tileTextureCount,
    tileInsideLimit,
    canTextureBeImproved,
};
