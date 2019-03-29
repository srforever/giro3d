import flatbush from 'flatbush';
import { Vector4 } from 'three';
import Extent from '../Core/Geographic/Extent';
import OGCWebServiceHelper from './OGCWebServiceHelper';
import Fetcher from './Fetcher';

function _selectImagesFromSpatialIndex(index, images, extent) {
    return index.search(
            extent.west(), extent.south(),
            extent.east(), extent.north()).map(i => images[i]);
}

// select the smallest image entirely covering the tile
function selectBestImageForExtent(layer, extent) {
    const candidates =
        _selectImagesFromSpatialIndex(
            layer._spatialIndex, layer.images, extent);

    let selection;
    for (const entry of candidates) {
        if (extent.isInside(entry.extent)) {
            if (!selection) {
                selection = entry;
            } else {
                const d = selection.extent.dimensions();
                const e = entry.extent.dimensions();
                if (e.x <= d.x && e.y <= d.y) {
                    selection = entry;
                }
            }
        }
    }
    if (selection) {
        return selection;
    }
    // nope : doesn't work
    // return;
    if (candidates.length == 0) {
        return;
    }
    // We didn't found an image containing entirely the extent,
    // but candidates isn't empty so we can return the smallest
    // that has the biggest coverage of the extent
    let coverage = 0;
    for (const entry of candidates) {
        const inter = entry.extent.intersect(extent);
        const dim = inter.dimensions();
        const cov = Math.floor(dim.x * dim.y);
        // console.log(cov, entry.image)
        if (cov >= coverage) {
            if (!selection) {
                selection = entry;
                coverage = cov;
            } else if (cov == coverage) {
                const d1 = entry.extent.dimensions();
                const d2 = selection.extent.dimensions();
                if (d1.x < d2.x && d1.y < d2.y) {
                    selection = entry;
                    coverage = cov;
                }
            } else {
                selection = entry;
                coverage = cov;
            }
        }
    }
    layer.discardOutsideUV = true;
    return selection;
}

function buildUrl(layer, image) {
    return layer.url.href.substr(0, layer.url.href.lastIndexOf('/') + 1)
        + image;
}

function getTexture(toDownload, layer) {
    // ...
    return (layer.format == 2 ?
        OGCWebServiceHelper.getXBilTextureByUrl(toDownload.url, layer.networkOptions) :
         OGCWebServiceHelper.getColorTextureByUrl(toDownload.url, layer.networkOptions)).then((texture) => {
        // adjust pitch
             const result = {
                 texture,
                 pitch: toDownload.pitch || new Vector4(0, 0, 1, 1),
             };

             result.texture.extent = toDownload.selection.extent;
             result.texture.file = toDownload.selection.image;
             if (layer.transparent) {
                 texture.premultiplyAlpha = true;
             }

             return result;
         });
}


/**
 * This provider uses no protocol but instead download static images directly.
 *
 * It uses as input 'image_filename: extent' values and then tries to find the best image
 * for a given tile using the extent property.
 */
export default {
    preprocessDataLayer(layer) {
        if (layer.extent) {
            console.warn('Ignoring given layer.extent, and rebuilding it from sources images instead');
        }
        layer.canTileTextureBeImproved = this.canTileTextureBeImproved;
        layer.url = new URL(layer.url, window.location);
        return Fetcher.json(layer.url.href, layer.networkOptions).then((metadata) => {
            layer.images = [];
            // eslint-disable-next-line guard-for-in
            for (const image in metadata) {
                const extent = new Extent(layer.projection, ...metadata[image]);
                layer.images.push({
                    image,
                    extent,
                });

                if (!layer.extent) {
                    layer.extent = extent.clone();
                } else {
                    layer.extent.union(extent);
                }
            }
            layer._spatialIndex = new flatbush(layer.images.length);
            for (const image of layer.images) {
                layer._spatialIndex.add(
                    image.extent.west(),
                    image.extent.south(),
                    image.extent.east(),
                    image.extent.north());
            }
            layer._spatialIndex.finish();

            const s = selectBestImageForExtent(layer, layer.extent);
            return getTexture({
                url: buildUrl(layer, s.image),
                selection: s,
            }, layer).then((result) => {
                layer.imageSize = {
                    w: result.texture.image.width,
                    h: result.texture.image.height,
                };
            });
        });
    },

    tileInsideLimit(tile, layer) {
        if (!layer.images) {
            return false;
        }

        return selectBestImageForExtent(layer, tile.extent);
            // layer._spatialIndex, layer.images, tile.extent.as(layer.extent.crs())).length > 0;
    },

    canTextureBeImproved(layer, extent, currentTexture) {
        if (!layer.images) {
            return;
        }
        const s = selectBestImageForExtent(layer, extent);

        if (!s) {
            return;
        }
        if (!currentTexture || (currentTexture && currentTexture.file != s.image)) {
            return {
                selection: s,
                pitch: extent.offsetToParent(s.extent),
                url: buildUrl(layer, s.image),
            };
        }
    },

    executeCommand(command) {
        const layer = command.layer;
        return getTexture(command.toDownload, layer);
    },
};
