import { fromUrl, Pool } from 'geotiff';
import {
    Vector4,
    FloatType,
    UnsignedByteType,
    LinearFilter,
} from 'three';
import TextureGenerator from '../utils/TextureGenerator.js';

import DataStatus from './DataStatus.js';
import WebGLComposer from '../renderer/composition/WebGLComposer.js';
import Rect from '../core/Rect.js';
import { GlobalCache } from '../core/Cache.js';
import CancelledCommandException from '../core/scheduler/CancelledCommandException.js';
import { Mode } from '../core/layer/Interpretation.js';
import HttpConfiguration from '../utils/HttpConfiguration.js';
import Extent from '../core/geographic/Extent.js';

function getMinMax(v, nodata) {
    // Currently for 1 band ONLY !
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0, l = v.length; i < l; i++) {
        const value = v[i];
        if (value !== nodata) {
            min = Math.min(value, min);
            max = Math.max(value, max);
        }
    }
    return { min, max };
}

function makeWindowFromExtent(layer, extent, resolution) {
    const [oX, oY] = layer.origin;
    const [imageResX, imageResY] = resolution;
    const ext = extent._values;

    const wnd = [
        Math.round((ext[0] - oX) / imageResX),
        Math.round((ext[2] - oY) / imageResY),
        Math.round((ext[1] - oX) / imageResX),
        Math.round((ext[3] - oY) / imageResY),
    ];

    const xmin = Math.min(wnd[0], wnd[2]);
    let xmax = Math.max(wnd[0], wnd[2]);
    const ymin = Math.min(wnd[1], wnd[3]);
    let ymax = Math.max(wnd[1], wnd[3]);

    // prevent zero-sized requests
    if (Math.abs(xmax - xmin) === 0) {
        xmax += 1;
    }
    if (Math.abs(ymax - ymin) === 0) {
        ymax += 1;
    }

    return [xmin, ymin, xmax, ymax];
}

function selectDataType(bytesPerPixel, bandCount) {
    if (bandCount === bytesPerPixel) {
        return UnsignedByteType;
    }

    return FloatType;
}

function processArrayData(layer, arrayData) {
    // Width and height in pixels of the returned data
    const { width, height } = arrayData;

    const dataType = selectDataType(layer.bpp, arrayData.length);

    const texture = TextureGenerator.createDataTexture(
        {
            width,
            height,
            nodata: layer.nodata,
        },
        dataType,
        ...arrayData,
    );

    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    return texture;
}

function getCacheKey(layer, extent) {
    return `buffer:${layer.id}${extent._values.join(',')}`;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function computeSize(arrays) {
    let size = 0;
    if (Array.isArray(arrays)) {
        arrays.forEach(a => { size += a.byteLength; });
    } else {
        size = arrays.byteLength;
    }
    return size;
}

function readBuffer(layer, extent, levelImage) {
    const key = getCacheKey(layer, extent);

    const cached = GlobalCache.get(key);
    if (cached) {
        return Promise.resolve(cached);
    }

    const promise = levelImage.image.readRasters({
        pool: layer.pool, // Use the pool of workers to decode faster
        window: makeWindowFromExtent(layer, extent, levelImage.resolution),
        fillValue: layer.nodata,
    }).then(arrayData => {
        const size = computeSize(arrayData);
        GlobalCache.set(key, arrayData, { size });
        return arrayData;
    });

    return promise;
}

/**
 * Create a texture on the given extent.
 *
 * @param {Function} throwIfCancelled The cancellation function.
 * @param {*} layer The layer to process.
 * @param {*} extent The requested extent.
 * @param {number} width The texture width, in pixels.
 * @param {number} height The texture height, in pixels.
 * @param {*} levelImage The TIFF image to read.
 * @param {Vector4} pitch The offset/scale of the resulting texture.
 * @param {boolean} computeLayerMinMax If true, a min/max will be computed on the image.
 * @returns {Promise} The promise containing the generated texture.
 */
async function createTexture(
    throwIfCancelled,
    layer,
    extent,
    width,
    height,
    levelImage,
    pitch,
    computeLayerMinMax = false,
) {
    // Let's wait a bit before processing the request to ensure that it was really needed.
    // As COG requests are HTTP heavy, we can save a lot of resources by not processing them.
    await delay(50);

    throwIfCancelled();

    try {
        const arrayData = await readBuffer(layer, extent, levelImage);

        throwIfCancelled();

        // Process the downloaded data
        const inputTexture = processArrayData(layer, arrayData);

        const isElevationLayer = layer.type === 'ElevationLayer';

        // There are two ways to compute the min/max of the texture: from the source data, or from
        // the generated texture. Both have pros and cons :
        //
        //  - From the source data: it is very fast and do not require a readback from the
        //    texture, but do not support intepretations other than raw (aka no interpretation)
        //
        //  - From the generated texture: supports all interpretations, but require a readback from
        //    the GPU memory into CPU memory to create a temporary copy of the data.
        //    Readbacks are generally quite slow as they must synchronize the GL context.
        const computeMinMaxInComposer = isElevationLayer && layer.interpretation.mode !== Mode.Raw;

        // Flip the texture using the composer instead of flipping during upload
        // See https://bugzilla.mozilla.org/show_bug.cgi?id=1400077
        const composer = new WebGLComposer({
            extent: Rect.fromExtent(extent),
            width,
            height,
            webGLRenderer: layer.instance.renderer,
            computeMinMax: computeMinMaxInComposer ? { noDataValue: layer.noDataValue } : false,
        });

        composer.draw(inputTexture, Rect.fromExtent(extent), {
            flipY: true,
            interpretation: layer.interpretation,
            fillNoData: isElevationLayer,
        });

        const texture = composer.render();

        // Attach the extent to the texture to check for possible improvements
        texture.extent = extent;
        composer.dispose();
        inputTexture.dispose();

        if (isElevationLayer) {
            let minmax;
            if (computeMinMaxInComposer) {
                minmax = { min: texture.min, max: texture.max };
            } else {
                minmax = getMinMax(arrayData[0], layer.nodata);
            }

            texture.min = minmax.min;
            texture.max = minmax.max;

            if (computeLayerMinMax) {
                // Initiate min and max data values to normalize 1 band files.
                // This is only done during the preprocessing step.
                layer.minmax = minmax;
            }
        }

        return { texture, pitch: pitch ?? new Vector4(0, 0, 1, 1) };
    } catch (error) {
        if (error.toString() === 'AggregateError: Request failed') {
            // Problem with the source that is blocked by another fetch
            // (request failed in readRasters). See the conversations in
            // https://github.com/geotiffjs/geotiff.js/issues/218
            // https://github.com/geotiffjs/geotiff.js/issues/221
            // https://github.com/geotiffjs/geotiff.js/pull/224
            // Retry until it is not blocked.
            return createTexture(
                throwIfCancelled,
                layer,
                extent,
                width,
                height,
                levelImage,
                pitch,
                computeLayerMinMax,
            );
        }
        throw error;
    }
}

/**
 * Attemps to compute the exact extent of the TIFF image. If fails, falls back to the layer extent.
 *
 * @param {*} layer The layer.
 * @param {*} tiffImage The TIFF image.
 */
function computePreciseExtent(layer, tiffImage) {
    try {
        const [
            minx,
            miny,
            maxx,
            maxy,
        ] = tiffImage.getBoundingBox();

        const crs = layer.extent.crs();
        const extent = new Extent(crs, minx, maxx, miny, maxy);
        layer.preciseExtent = extent;
    } catch (e) {
        layer.preciseExtent = layer.extent;
        if (e.message !== 'The image does not have an affine transformation.') {
            throw e;
        }
    }
}

async function getImages(layer) {
    // Get the COG informations
    const opts = {};
    HttpConfiguration.applyConfiguration(layer.source.url, opts);
    const tiff = await fromUrl(layer.source.url, opts);
    // Number of images (original + overviews)
    const count = await tiff.getImageCount();
    // Get original image header
    const firstImage = await tiff.getImage();

    computePreciseExtent(layer, firstImage);

    // Precompute the layer dimensions to later calculate data windows
    layer.dimension = layer.preciseExtent.dimensions();

    // Get the origin
    layer.origin = firstImage.getOrigin();
    layer.bpp = firstImage.getBytesPerPixel();
    // Get the nodata value
    layer.nodata = firstImage.getGDALNoData();
    // Prepare the different images and their corresponding sizes
    // Go through the different overviews in order
    let image = firstImage;
    let levelImage = {
        image: firstImage,
        width: firstImage.getWidth(),
        height: firstImage.getHeight(),
        resolution: firstImage.getResolution(),
    };
    layer.images = [levelImage];
    // We want to preserve the order of the overviews so we await them inside
    // the loop not to have the smallest overviews coming before the biggest
    /* eslint-disable no-await-in-loop */
    for (let i = 1; i < count; i++) {
        image = await tiff.getImage(i);
        levelImage = {
            image,
            width: image.getWidth(),
            height: image.getHeight(),
            resolution: image.getResolution(firstImage),
        };
        layer.images.push(levelImage);
    }
    // If there is only one band, get min and max to normalize the data For
    // performances, we use the latest image, meaning the highest overview
    // (lowest resolution)
    if (image.getSamplesPerPixel() === 1) {
        const computeLayerMinMax = layer.minmax == null;
        const noCancellation = () => {};
        await createTexture(
            noCancellation,
            layer,
            layer.preciseExtent,
            256,
            256,
            levelImage,
            new Vector4(0, 0, 1, 1),
            computeLayerMinMax,
        );
    }
}

function preprocessDataLayer(layer) {
    // Initiate a pool of workers to decode COG chunks
    layer.pool = new Pool();
    // Get and store needed metadata
    return getImages(layer);
}

function getPossibleTextureImprovements({
    layer,
    extent,
    texture,
    size,
}) {
    // Number of images  = original + overviews if any
    const imageCount = layer.images.length;
    extent = extent.intersect(layer.preciseExtent);
    // Dimensions of the requested extent
    const extentDimension = extent.dimensions();

    const targetResolution = Math.min(
        extentDimension.x / size.width,
        extentDimension.y / size.height,
    );

    let levelImage;

    // Select the image with the best resolution for our needs
    for (let i = imageCount - 1; i >= 0; i--) {
        levelImage = layer.images[i];
        const sourceResolution = Math.min(
            layer.dimension.x / levelImage.width,
            layer.dimension.y / levelImage.height,
        );

        if (targetResolution >= sourceResolution) {
            break;
        }
    }

    const adjusted = extent.fitToGrid(
        layer.preciseExtent,
        levelImage.width,
        levelImage.height,
        8,
        8,
    );

    const pixelPerfectExtent = adjusted.extent;

    // If the tile is already displayed, don't update
    if (texture && texture.extent && texture.extent.equals(pixelPerfectExtent)) {
        return DataStatus.DATA_ALREADY_LOADED;
    }

    const pixelWidth = Math.min(size.width, adjusted.width);
    const pixelHeight = Math.min(size.height, adjusted.height);

    return {
        extent: pixelPerfectExtent,
        levelImage,
        pixelWidth,
        pixelHeight,
    };
}

function executeCommand(instance, layer, requester, toDownload, earlyDropFunction) {
    function throwIfCancelled() {
        if (earlyDropFunction && earlyDropFunction()) {
            throw new CancelledCommandException(layer, requester);
        }
    }

    // Get the image at the appropriate overview level
    const {
        extent,
        levelImage,
        pitch,
        pixelWidth,
        pixelHeight,
    } = toDownload;

    return Promise.resolve(
        createTexture(
            throwIfCancelled,
            layer,
            extent,
            pixelWidth,
            pixelHeight,
            levelImage,
            pitch,
        ),
    );
}

function tileInsideLimit(tile, layer) {
    const extent = tile.getExtentForLayer(layer);
    return extent.intersectsExtent(layer.preciseExtent);
}

export default {
    executeCommand,
    getPossibleTextureImprovements,
    preprocessDataLayer,
    tileInsideLimit,
    computePreciseExtent,
};
