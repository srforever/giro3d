import { Vector4, Texture, Group } from 'three';
import { fromUrl, Pool } from 'geotiff';

import Cache from '../Core/Scheduler/Cache.js';
import C3DEngine from '../Renderer/c3DEngine.js';

import ColorLayer from '../Core/layer/ColorLayer.js';
import ElevationLayer from '../Core/layer/ElevationLayer.js';

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

async function processSmallestOverview(layer, levelImage) {
    const arrayData = await levelImage.image.readRasters({
        window: makeWindowFromExtent(layer, layer.extent, levelImage.resolution),
        fillValue: layer.nodata,
    });
    // Initiate min and max data values to normalize 1 band files
    layer.minmax = getMinMax(arrayData[0], layer.nodata);
    if (layer instanceof ColorLayer) {
        // While we are at it let's cache the texture
        const result = { pitch: new Vector4(0, 0, 1, 1), texture: new Texture() };
        // Process the downloaded data
        const { data, width, height } = processData(layer, arrayData);
        // We have to convert the texture image data to a proper image
        // to display it on the tile
        result.texture.image = C3DEngine.bufferToImage(
            data, width, height,
        );
        // Put the extent to indicate the overview has been processed
        result.texture.extent = layer.extent;
        // Assuming everything went fine, put the texture in cache
        const key = `${layer.id}${layer.extent._values.join(',')}`;
        Cache.set(key, result);
    }
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
        await processSmallestOverview(layer, levelImage);
    }
}

function preprocessDataLayer(layer) {
    // Initiate a pool of workers to decode COG chunks
    layer.pool = new Pool();
    // Set the tiles size threshold to switch between overviews
    layer.imageSize = { w: 256, h: 256 };
    // Precompute the layer dimensions to later calculate data windows
    layer.dimension = layer.extent.dimensions();
    // useAsObject is defined, prepare an object3d to store meshes
    if (layer.useAsObject) {
        layer.object3d = new Group();
    }
    // Get and store needed metadata
    return getImages(layer);
}

function getPossibleTextureImprovements(layer, extent, texture) {
    // If the tile is already displayed, don't update
    if (texture
        && texture.extent
        && texture.extent.isInside(extent)
        && !texture.usedForInit) {
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
    let level = overviewCount;
    let levelImage = layer.images[level];
    let tileWidth = levelImage.width * widthRatio;
    let tileHeight = levelImage.height * heightRatio;
    // Iterate through the overviews until finding the appropriate resolution
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

function processData(layer, arrayData) {
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

function executeCommand(command) {
    const { layer } = command;
    // Get the image at the appropriate overview level
    const { extent, levelImage } = command.toDownload;
    // Make the key to store the texture in cache with the subdivised tilednode extent
    const key = `${layer.id}_${extent._values.join(',')}`;
    // Get the texture if it already exists
    let result = Cache.get(key);
    if (result) {
        return Promise.resolve(result);
    }
    // Force the pitch.z to be 0 in case of elevation to circumvent the if
    // (elevationOffsetScale.z > 0.) in TileVS.js. We do so because the
    // texture-based approach for elevation/stiching doesn't work with nodata
    // and irregular border grids. We have to have pitch.z = 1 for the color
    // textures to be correctly applied on elevation ones.
    const pitchZ = layer instanceof ElevationLayer ? 0 : 1;
    // Prepare an empty texture
    result = {
        pitch: new Vector4(0, 0, pitchZ, 1), texture: new Texture(),
    };
    // Attach the extent to the texture to check for possible improvements
    result.texture.extent = extent;
    // Read and return the raster data
    return levelImage.image.readRasters({
        pool: layer.pool, // Use the pool of workers to decode faster
        window: makeWindowFromExtent(layer, extent, levelImage.resolution),
        fillValue: layer.nodata,
    }).then(arrayData => {
        if (layer instanceof ColorLayer) {
            // Process the downloaded data
            const { data, width, height } = processData(layer, arrayData);
            // We have to convert the texture image data to a proper image to display it on the tile
            result.texture.image = C3DEngine.bufferToImage(data, width, height);
        } else if (layer instanceof ElevationLayer) {
            result.arrayData = arrayData;
        } else {
            throw new Error('The COG layer should be a ColorLayer or ElevationLayer');
        }
        // Everything went fine, put the texture in cache
        Cache.set(key, result);
        return result;
    // Problem with the source that is blocked by another fetch
    // (request failed in readRasters). See the conversation in
    // https://github.com/geotiffjs/geotiff.js/issues/218
    // https://github.com/geotiffjs/geotiff.js/issues/221
    // https://github.com/geotiffjs/geotiff.js/pull/224
    // Bypassing the error so that it doesn't break the rendering by
    // catching it and returning the empty texture. It displays an empty
    // tile until the request is relaunched and works.
    }).catch(error => {
        if (error.toString() === 'AggregateError: Request failed') {
            return result;
        }
        throw new Error(error);
    });
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
