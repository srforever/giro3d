import Extent from '../Core/Geographic/Extent';
import OGCWebServiceHelper from './OGCWebServiceHelper';
import URLBuilder from './URLBuilder';
import { STRATEGY_MIN_NETWORK_TRAFFIC, STRATEGY_PROGRESSIVE, STRATEGY_DICHOTOMY } from '../Core/Layer/LayerUpdateStrategy';

const supportedFormats = ['image/png', 'image/jpg', 'image/jpeg'];

function tileTextureCount() {
    return 1;
}

function preprocessDataLayer(layer) {
    if (!layer.name) {
        throw new Error('layer.name is required.');
    }
    if (!layer.extent) {
        throw new Error('layer.extent is required');
    }
    if (!layer.projection) {
        throw new Error('layer.projection is required');
    }

    if (!(layer.extent instanceof Extent)) {
        layer.extent = new Extent(layer.projection, layer.extent);
    }

    if (!layer.options.zoom) {
        layer.options.zoom = { min: 0, max: 21 };
    }

    layer.format = layer.format || 'image/png';
    if (!supportedFormats.includes(layer.format)) {
        throw new Error(`Layer ${layer.name}: unsupported format '${layer.format}', should be one of '${supportedFormats.join('\', \'')}'`);
    }

    layer.width = layer.heightMapWidth || 256;
    layer.version = layer.version || '1.3.0';
    layer.style = layer.style || '';
    layer.transparent = layer.transparent || false;

    if (!layer.axisOrder) {
        // 4326 (lat/long) axis order depends on the WMS version used
        if (layer.projection == 'EPSG:4326') {
            // EPSG 4326 x = lat, long = y
            // version 1.1.0 long/lat while version 1.3.0 mandates xy (so lat,long)
            layer.axisOrder = (layer.version === '1.1.0' ? 'wsen' : 'swne');
        } else {
            // xy,xy order
            layer.axisOrder = 'wsen';
        }
    }
    let crsPropName = 'SRS';
    if (layer.version === '1.3.0') {
        crsPropName = 'CRS';
    }

    layer.url = `${layer.url
                  }?SERVICE=WMS&REQUEST=GetMap&LAYERS=${layer.name
                  }&VERSION=${layer.version
                  }&STYLES=${layer.style
                  }&FORMAT=${layer.format
                  }&TRANSPARENT=${layer.transparent
                  }&BBOX=%bbox` +
                  `&${crsPropName}=${layer.projection
                  }&WIDTH=${layer.width
                  }&HEIGHT=${layer.width}`;
}

function tileInsideLimit(tile, layer) {
    const extent = tile.getExtentForLayer(layer);
    return extent.as(layer.extent.crs()).isInside(layer.extent);
}

function canTextureBeImproved(layer, extent, texture, previousError) {
    const ex = extent.as(layer.extent.crs());

    // if texture extent matches extent => we're good
    if (texture && texture.extent && texture.extent.isInside(extent)) {
        return;
    }

    return selectAllExtentsToDownload(layer, ex, texture, previousError);
}

function selectAllExtentsToDownload(layer, ex, texture, previousError) {
    const extent = chooseExtentToDownload(
        layer,
        ex,
        (texture && texture.extent) ? texture.extent : null,
        previousError);
    // if the choice is the same as the current one => stop updating
    if (texture && texture.extent && texture.extent.isInside(extent)) {
        return;
    }
    const pitch = ex.offsetToParent(extent);
    return {
        extent,
        pitch,
        url: URLBuilder.bbox(extent, layer),
    };
}

export function chooseExtentToDownload(layer, extent, currentExtent) {
    if (layer.updateStrategy.type == STRATEGY_MIN_NETWORK_TRAFFIC) {
        return extent;
    }
    if (!currentExtent) {
        return layer.extent;
    }
    // Do a quadtree subdivision of the layer's extent and align downloaded
    // textures on this grid to increase texture reuse between nodes.
    // TODO: the allowed resolutions should be configurables, see the
    // "resolutions" options in OpenLayers for instance. For now the subdivision
    // is based solely on layer's extent.
    const dim = extent.dimensions();
    const cur = currentExtent.dimensions();
    const lay = layer.extent.dimensions();

    const nodeDepth = Math.floor(Math.log2(1 / (dim.x / lay.x)));
    const currentDepth = Math.floor(Math.log2(1 / (cur.x / lay.x)));

    if (nodeDepth <= (currentDepth + 1)) {
        return extent;
    }

    const offsetScale = extent.offsetToParent(layer.extent);
    let nextDepth = currentDepth;
    switch (layer.updateStrategy.type) {
        case STRATEGY_PROGRESSIVE:
            nextDepth = currentDepth + 1;
            break;
        default:
        case STRATEGY_DICHOTOMY:
            nextDepth = Math.ceil((currentDepth + nodeDepth) / 2);
            break;
    }


    if (nextDepth >= nodeDepth) {
        return extent;
    }
    while (nextDepth > currentDepth) {
        const p = Math.pow(2, nextDepth);
        // the normalized ([0, 1]) texture size for each tile at this level
        const textureSize = 1 / p;

        const x = {
            min: textureSize * Math.floor(offsetScale.x / textureSize),
            max: textureSize * (1 + Math.floor(offsetScale.x / textureSize)),
        };
        const y = {
            min: textureSize * Math.floor(offsetScale.y / textureSize),
            max: textureSize * (1 + Math.floor((offsetScale.y + offsetScale.w) / textureSize)),
        };

        const ex = new Extent(currentExtent.crs(), {
            west: layer.extent.west() + x.min * lay.x,
            east: layer.extent.west() + x.max * lay.x,
            north: layer.extent.north() - y.min * lay.y,
            south: layer.extent.north() - y.max * lay.y,
        });

        // extent might be at a boundary of the quadtree so the parent extent
        // may not cover it entirely
        if (extent.isInside(ex)) {
            return ex;
        } else {
            nextDepth -= 1;
        }
    }
    return extent;
}

function getColorTexture(layer, toDownload) {
    const result = { pitch: toDownload.pitch };
    return OGCWebServiceHelper.getColorTextureByUrl(toDownload.url, layer.networkOptions).then(texture => {
        result.texture = texture;
        result.texture.extent = toDownload.extent;
        if (layer.transparent) {
            texture.premultiplyAlpha = true;
        }
        return result;
    }, err => {
        err.extent = toDownload.extent;
        throw err;
    });
}

function executeCommand(command) {
    return getColorTexture(command.layer, command.toDownload);
}

export default {
    preprocessDataLayer,
    executeCommand,
    tileTextureCount,
    tileInsideLimit,
    canTextureBeImproved,
};
