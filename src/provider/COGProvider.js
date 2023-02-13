import { fromUrl, Pool } from 'geotiff';
import { Vector4, FloatType, UnsignedByteType } from 'three';
import TextureGenerator from '../utils/TextureGenerator.js';

import DataStatus from './DataStatus.js';
import WebGLComposer from '../renderer/composition/WebGLComposer.js';
import Rect from '../core/Rect.js';
import Cache from '../core/scheduler/Cache.js';

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

    return texture;
}

function getCacheKey(layer, extent) {
    return `buffer:${layer.id}${extent._values.join(',')}`;
}

function readBuffer(layer, extent, levelImage) {
    const key = getCacheKey(layer, extent);

    const cached = Cache.get(key);
    if (cached) {
        return Promise.resolve(cached);
    }

    const promise = levelImage.image.readRasters({
        pool: layer.pool, // Use the pool of workers to decode faster
        window: makeWindowFromExtent(layer, extent, levelImage.resolution),
        fillValue: layer.nodata,
    }).then(arrayData => {
        Cache.set(key, arrayData, Cache.POLICIES.TEXTURE);
        return arrayData;
    });

    return promise;
}

function createTexture(layer, extent, levelImage, pitch, computeMinMax = false) {
    // Read and return the raster data
    return readBuffer(layer, extent, levelImage).then(arrayData => {
        if (computeMinMax) {
            // Initiate min and max data values to normalize 1 band files.
            // This is only done during the preprocessing step.
            layer.minmax = getMinMax(arrayData[0], layer.nodata);
        }

        // Process the downloaded data
        const { width, height } = arrayData;
        const inputTexture = processArrayData(layer, arrayData);

        // Flip the texture using the composer instead of flipping during upload
        // See https://bugzilla.mozilla.org/show_bug.cgi?id=1400077
        const composer = new WebGLComposer({
            extent: Rect.fromExtent(extent),
            width,
            height,
            webGLRenderer: layer.instance.renderer,
            createDataCopy: layer.type === 'ElevationLayer',
        });
        composer.draw(inputTexture, Rect.fromExtent(extent), {
            flipY: true,
            interpretation: layer.interpretation,
        });
        const texture = composer.render();
        // Attach the extent to the texture to check for possible improvements
        texture.extent = extent;
        composer.dispose();
        inputTexture.dispose();

        return { texture, pitch: pitch ?? new Vector4(0, 0, 1, 1) };
    }).catch(error => {
        if (error.toString() === 'AggregateError: Request failed') {
            // Problem with the source that is blocked by another fetch
            // (request failed in readRasters). See the conversations in
            // https://github.com/geotiffjs/geotiff.js/issues/218
            // https://github.com/geotiffjs/geotiff.js/issues/221
            // https://github.com/geotiffjs/geotiff.js/pull/224
            // Retry until it is not blocked.
            return createTexture(layer, extent, levelImage, pitch, computeMinMax);
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
        await createTexture(layer, layer.extent, levelImage, new Vector4(0, 0, 1, 1), true);
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

function getPossibleTextureImprovements(layer, extent, texture, pitch) {
    // If the tile is already displayed, don't update
    if (texture && texture.extent && texture.extent.isInside(extent)) {
        return DataStatus.DATA_ALREADY_LOADED;
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
        extent, levelImage, pitch,
    };
}

function executeCommand(command) {
    const { layer } = command;
    // Get the image at the appropriate overview level
    const { extent, levelImage, pitch } = command.toDownload;

    return Promise.resolve(createTexture(layer, extent, levelImage, pitch));
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
