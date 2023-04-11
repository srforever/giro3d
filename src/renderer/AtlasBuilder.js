import { Vector2 } from 'three';
import fit from './Packer.js';

/**
 * An atlas image.
 *
 * @typedef {object} AtlasImage
 * @property {string} id The unique identifier of this image in the atlas.
 * @property {Vector2} size The size of the image, in pixels.
 */

/**
 * Build a texture atlas from N images.
 *
 * @param {number} maxSize The maximum texture size of the atlas, in pixels.
 * @param {Array<AtlasImage>} images The images to pack.
 * @param {object} oldAtlas The previous atlas.
 */
function pack(maxSize, images, oldAtlas) {
    const blocks = [];

    for (let i = 0; i < images.length; i++) {
        if (oldAtlas && images[i].id in oldAtlas) {
            continue;
        }
        const sWidth = images[i].size.width;
        const sHeight = images[i].size.height;

        blocks.push({
            layerId: images[i].id,
            w: Math.min(maxSize, sWidth),
            h: Math.min(maxSize, sHeight),
        });
    }

    // sort from big > small images (the packing alg works best if big images are treated first)
    blocks.sort((a, b) => Math.max(a.w, a.h) < Math.max(b.w, b.h));

    let previousRoot;
    if (oldAtlas) {
        for (const k of Object.keys(oldAtlas)) { // eslint-disable-line guard-for-in
            const fitResult = oldAtlas[k];
            if (fitResult.x === 0 && fitResult.y === 0) {
                // Updating
                previousRoot = fitResult;
                break;
            }
        }
    }
    if (oldAtlas && !previousRoot) {
        console.error('UH: oldAtlas is defined, but not previousRoot');
    }

    const { maxX, maxY } = fit(blocks, maxSize, maxSize, previousRoot);

    const atlas = oldAtlas || {};
    for (let i = 0; i < blocks.length; i++) {
        atlas[blocks[i].layerId] = blocks[i].fit;
        atlas[blocks[i].layerId].offset = 0;
    }

    return { atlas, maxX, maxY };
}

export default {
    pack,
};
