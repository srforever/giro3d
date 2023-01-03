import Flatbush from 'flatbush';
import { Vector4 } from 'three';

import Extent from '../Core/Geographic/Extent.js';
import DataStatus from './DataStatus.js';
import Fetcher from './Fetcher.js';
import MemoryTracker from '../Renderer/MemoryTracker.js';
import TextureGenerator from '../utils/TextureGenerator.js';
import WebGLComposer from '../Renderer/composition/WebGLComposer.js';
import ElevationLayer from '../Core/layer/ElevationLayer.js';
import Rect from '../Core/Rect.js';

function _selectImagesFromSpatialIndex(index, images, extent) {
    return index.search(
        extent.west(), extent.south(),
        extent.east(), extent.north(),
    ).map(i => images[i]);
}

// select the smallest image entirely covering the tile
let inter = new Extent('dummy', 0, 0, 0, 0);
function selectBestImageForExtent(layer, extent) {
    const candidates = _selectImagesFromSpatialIndex(
        layer._spatialIndex, layer.images, extent,
    );

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
    if (candidates.length === 0) {
        return null;
    }
    // We didn't found an image containing entirely the extent,
    // but candidates isn't empty so we can return the smallest
    // that has the biggest coverage of the extent
    let coverage = 0;
    for (const entry of candidates) {
        inter.copy(entry.extent);
        inter = inter.intersect(extent);
        const dim = inter.dimensions();
        const cov = Math.floor(dim.x * dim.y);
        // console.log(cov, entry.image)
        if (cov >= coverage) {
            if (!selection) {
                selection = entry;
                coverage = cov;
            } else if (cov === coverage) {
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
    return selection;
}

async function getTexture(toDownload, instance, layer) {
    const { extent, url, selection } = toDownload;
    const blob = await Fetcher.blob(url);
    const inputTexture = await TextureGenerator.decodeBlob(blob);

    const isElevationLayer = layer instanceof ElevationLayer;

    const composer = new WebGLComposer({
        extent: Rect.fromExtent(extent),
        width: layer.imageSize.w,
        height: layer.imageSize.h,
        webGLRenderer: instance.renderer,
        showImageOutlines: layer.showTileBorders || false,
        createDataCopy: isElevationLayer,
    });

    const options = { interpretation: layer.interpretation };
    composer.draw(inputTexture, Rect.fromExtent(selection.extent), options);

    const texture = composer.render();

    texture.extent = extent;
    texture.file = toDownload.selection.image;

    if (__DEBUG__) {
        MemoryTracker.track(texture, 'custom tiled image');
    }
    return { texture, pitch: new Vector4(0, 0, 1, 1) };
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
            console.warn(
                'Ignoring given layer.extent, and rebuilding it from sources images instead',
            );
        }
        layer.canTileTextureBeImproved = this.canTileTextureBeImproved;
        return layer.source.fetchMetadata().then(metadata => {
            layer.images = [];
            // eslint-disable-next-line guard-for-in
            for (const image of Object.keys(metadata)) {
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
            layer._spatialIndex = new Flatbush(layer.images.length);
            for (const image of layer.images) {
                layer._spatialIndex.add(
                    image.extent.west(),
                    image.extent.south(),
                    image.extent.east(),
                    image.extent.north(),
                );
            }
            layer._spatialIndex.finish();
        });
    },

    tileInsideLimit(tile, layer) {
        if (!layer.images) {
            return false;
        }

        return selectBestImageForExtent(layer, tile.extent);
    },

    getPossibleTextureImprovements(layer, extent, currentTexture) {
        if (!layer.images) {
            // We may still be loading the images
            return DataStatus.DATA_NOT_AVAILABLE_YET;
        }
        const s = selectBestImageForExtent(layer, extent);

        if (!s) {
            return DataStatus.DATA_UNAVAILABLE;
        }
        if (currentTexture && currentTexture.file === s.image) {
            return DataStatus.DATA_ALREADY_LOADED;
        }
        return {
            selection: s,
            extent,
            url: layer.source.buildUrl(s.image),
        };
    },

    executeCommand(command) {
        const { layer, instance } = command;
        return getTexture(command.toDownload, instance, layer);
    },
};
