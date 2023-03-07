import Flatbush from 'flatbush';
import { Texture, Vector2 } from 'three';

import Extent from '../core/geographic/Extent.js';
import DataStatus from './DataStatus.js';
import Fetcher from '../utils/Fetcher.js';
import MemoryTracker from '../renderer/MemoryTracker.js';
import TextureGenerator from '../utils/TextureGenerator.js';
import WebGLComposer from '../renderer/composition/WebGLComposer.js';
import ElevationLayer from '../core/layer/ElevationLayer.js';
import Rect from '../core/Rect.js';
import { GlobalCache } from '../core/Cache.js';

const temp = {
    dim: new Vector2(),
};

/**
 * @param {Flatbush} index The spatial index to query.
 * @param {Array} images The images in the layer.
 * @param {Extent} extent The extent of the request.
 * @returns {Array} The candidates, ordered by descending size
 */
function getImages(index, images, extent) {
    const xmin = extent.west();
    const xmax = extent.east();
    const ymin = extent.south();
    const ymax = extent.north();

    const candidates = index.search(xmin, ymin, xmax, ymax).map(i => images[i]);

    candidates.sort((a, b) => (b.size - a.size));

    return candidates;
}

/**
 * Dispose the texture contained in the promise.
 *
 * @param {Promise<Texture>} promise The texture promise.
 */
function onDelete(promise) {
    promise.then(t => t.dispose());
}

async function loadTexture(url) {
    let promise = GlobalCache.get(url);
    if (promise) {
        return promise;
    }

    promise = Fetcher.blob(url).then(blob => TextureGenerator.decodeBlob(blob));

    GlobalCache.set(url, promise, { onDelete });

    return promise;
}

function getKey(images) {
    let key = '';
    for (const img of images) {
        key += img.image;
    }
    return key;
}

async function getTexture(toDownload, instance, layer) {
    const { extent, images, pitch } = toDownload;

    const isElevationLayer = layer instanceof ElevationLayer;

    const composer = new WebGLComposer({
        extent: Rect.fromExtent(extent),
        width: layer.imageSize.w,
        height: layer.imageSize.h,
        webGLRenderer: instance.renderer,
        showImageOutlines: layer.showTileBorders || false,
        createDataCopy: isElevationLayer,
    });

    let z = 0;

    const promises = [];

    for (const img of images) {
        const options = {
            interpretation: layer.interpretation,
            zOrder: z,
        };

        z += 0.1;
        const promise = loadTexture(img.url)
            .then(tex => {
                composer.draw(tex, Rect.fromExtent(img.extent), options);
            })
            .catch(e => {
                throw e;
            });

        promises.push(promise);
    }

    await Promise.all(promises);

    const texture = composer.render();

    texture.extent = extent;
    texture.key = getKey(images);

    composer.dispose();

    if (__DEBUG__) {
        MemoryTracker.track(texture, 'custom tiled image');
    }
    return { texture, pitch };
}

/**
 * This provider uses no protocol but instead download static images directly.
 *
 * It uses as input 'image_filename: extent' values and then tries to find the best image
 * for a given tile using the extent property.
 */
export default {
    preprocessDataLayer(layer) {
        layer.canTileTextureBeImproved = this.canTileTextureBeImproved;
        return layer.source.fetchMetadata().then(metadata => {
            layer.images = [];
            for (const image of Object.keys(metadata)) {
                const extent = new Extent(layer.projection, ...metadata[image]);
                const dim = extent.dimensions(temp.dim);
                const size = Math.max(dim.x, dim.y);
                const url = layer.source.buildUrl(image);
                layer.images.push({
                    image,
                    extent,
                    size,
                    url,
                });
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

        /** @type {Flatbush} */
        const index = layer._spatialIndex;
        const extent = tile.extent;

        const xmin = extent.west();
        const xmax = extent.east();
        const ymin = extent.south();
        const ymax = extent.north();

        const results = index.search(xmin, ymin, xmax, ymax);

        // At least one image must intersect the tile
        return (results && results.length > 0);
    },

    getPossibleTextureImprovements(layer, extent, currentTexture, pitch) {
        if (!layer.images) {
            // We may still be loading the images
            return DataStatus.DATA_NOT_AVAILABLE_YET;
        }
        const images = getImages(layer._spatialIndex, layer.images, extent);

        if (!images || images?.length === 0) {
            return DataStatus.DATA_UNAVAILABLE;
        }

        const key = getKey(images);

        if (currentTexture?.key === key) {
            return DataStatus.DATA_ALREADY_LOADED;
        }
        return { images, extent, pitch };
    },

    executeCommand(command) {
        const { layer, instance } = command;
        return getTexture(command.toDownload, instance, layer);
    },
};
