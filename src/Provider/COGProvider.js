import { fromUrl, Pool } from 'geotiff';
import { Vector4, DataTexture } from 'three';

import Cache from '../Core/Scheduler/Cache.js';
import { ELEVATION_FORMAT } from '../utils/DEMUtils.js';

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
    return [
        Math.min(wnd[0], wnd[2]),
        Math.min(wnd[1], wnd[3]),
        Math.max(wnd[0], wnd[2]),
        Math.max(wnd[1], wnd[3]),
    ];
}

function processArrayData(layer, arrayData) {
    // Width and height in pixels of the returned data
    const { width, height } = arrayData;
    // We have to check wether it is an array of colors because we
    // want to handle floating point intensity files as color
    // layers too
    const data = new Uint8ClampedArray(width * height * 4);
    // If there are 3 bands, assume that it's RGB
    if (arrayData.length === 3) {
        const [r, g, b] = arrayData;
        for (let i = 0, l = r.length; i < l; i++) {
            const i4 = i * 4;
            data[i4 + 0] = r[i];
            data[i4 + 1] = g[i];
            data[i4 + 2] = b[i];
            data[i4 + 3] = 255;
        }
    // If there are 4 bands, assume that it's RGBA
    } else if (arrayData.length === 4) {
        const [r, g, b, a] = arrayData;
        for (let i = 0, l = r.length; i < l; i++) {
            const i4 = i * 4;
            data[i4 + 0] = r[i];
            data[i4 + 1] = g[i];
            data[i4 + 2] = b[i];
            data[i4 + 3] = a[i];
        }
    // Else if there is only one band, assume that it's not colored and
    // normalize it.
    } else {
        if (arrayData.length !== 1) {
            console.warn(
                "Band selection isn't implemented yet.",
                'Processing the first one as if it was a 1-band file.',
            );
        }
        const [v] = arrayData;
        const nodata = layer.nodata;
        const dataMin = layer.minmax.min;
        const dataFactor = 255 / (layer.minmax.max - dataMin);
        for (let i = 0, l = v.length; i < l; i++) {
            const vi = v[i];
            const value = Math.round((vi - dataMin) * dataFactor);
            const i4 = i * 4;
            data[i4 + 0] = value;
            data[i4 + 1] = value;
            data[i4 + 2] = value;
            data[i4 + 3] = vi === nodata ? 0 : 255;
        }
    }
    return { data, width, height };
}

function createTexture(layer, extent, levelImage, computeMinMax = false) {
    // Read and return the raster data
    return levelImage.image.readRasters({
        pool: layer.pool, // Use the pool of workers to decode faster
        window: makeWindowFromExtent(layer, extent, levelImage.resolution),
        fillValue: layer.nodata,
    }).then(arrayData => {
        if (computeMinMax) {
            // Initiate min and max data values to normalize 1 band files.
            // This is only done during the preprocessing step.
            layer.minmax = getMinMax(arrayData[0], layer.nodata);
        }
        // Attach arrayData to the result to recreate TileGeometry in ElevationLayer
        const result = { arrayData, pitch: new Vector4(0, 0, 1, 1) };
        // Process the downloaded data
        const { data, width, height } = processArrayData(layer, arrayData);
        const imageData = new ImageData(data, width, height);
        result.texture = new DataTexture(imageData, width, height);
        result.texture.flipY = true;
        // Attach the extent to the texture to check for possible improvements
        result.texture.extent = extent;
        if (layer.minmax) {
            // Add min and max to the texture for this.MinMaxFromTexture
            result.texture.min = layer.minmax.min;
            result.texture.max = layer.minmax.max;
        }
        // Cache the result not to have to fetch the data again
        Cache.set(`${layer.id}${extent._values.join(',')}`, result);
        return result;
    }).catch(error => {
        if (error.toString() === 'AggregateError: Request failed') {
            // Problem with the source that is blocked by another fetch
            // (request failed in readRasters). See the conversations in
            // https://github.com/geotiffjs/geotiff.js/issues/218
            // https://github.com/geotiffjs/geotiff.js/issues/221
            // https://github.com/geotiffjs/geotiff.js/pull/224
            // Retry until it is not blocked.
            return createTexture(layer, extent, levelImage, computeMinMax);
        }
        throw new Error(error);
    });
}

async function getImages(layer) {
    // Get the COG informations
    const tiff = await fromUrl(layer.source.url);
    // Number of images (original + overviews)
    const count = await tiff.getImageCount();
    // Get original image header
    const firstImage = await tiff.getImage();
    // Get the origin
    layer.origin = firstImage.getOrigin();
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
        layer.elevationFormat = ELEVATION_FORMAT.NUMERIC;
        await createTexture(layer, layer.extent, levelImage, true);
    }
}

function preprocessDataLayer(layer) {
    // Initiate a pool of workers to decode COG chunks
    layer.pool = new Pool();
    // Precompute the layer dimensions to later calculate data windows
    layer.dimension = layer.extent.dimensions();
    // Get and store needed metadata
    return getImages(layer);
}

function getPossibleTextureImprovements(layer, extent, texture) {
    // If the tile is already displayed, don't update
    if (texture && texture.extent && texture.extent.isInside(extent)) {
        return null;
    }
    // Number of images  = original + overviews if any
    const overviewCount = layer.images.length - 1;
    // Dimensions of the requested extent
    const extentDimension = extent.dimensions();
    // Extent ratios in width/height
    const widthRatio = extentDimension.x / layer.dimension.x;
    const heightRatio = extentDimension.y / layer.dimension.y;
    // Calculate the corresponding size of the requested data
    // Iterate through the overviews until finding the appropriate resolution
    let level = overviewCount;
    let levelImage = layer.images[level];
    let tileWidth = levelImage.width * widthRatio;
    let tileHeight = levelImage.height * heightRatio;
    while (level > 0 && tileWidth < layer.imageSize.w && tileHeight < layer.imageSize.h) {
        level--;
        levelImage = layer.images[level];
        tileWidth = levelImage.width * widthRatio;
        tileHeight = levelImage.height * heightRatio;
    }
    return {
        extent, levelImage,
    };
}

function executeCommand(command) {
    const { layer } = command;
    // Get the image at the appropriate overview level
    const { extent, levelImage } = command.toDownload;
    // Make the key to store the texture in cache with the subdivised tilednode extent
    const key = `${layer.id}${extent._values.join(',')}`;
    // Get the result with data and texture if it already exists
    const result = Cache.get(key);
    if (result) {
        return Promise.resolve(result);
    }
    return Promise.resolve(createTexture(layer, extent, levelImage));
}

function tileInsideLimit(tile, layer) {
    const extent = tile.getExtentForLayer(layer);
    return extent.isInside(layer.extent);
}

export default {
    executeCommand,
    getPossibleTextureImprovements,
    preprocessDataLayer,
    tileInsideLimit,
};
