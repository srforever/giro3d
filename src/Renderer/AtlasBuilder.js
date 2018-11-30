import * as THREE from 'three';
import Capabilities from '../Core/System/Capabilities';
import fit from './Packer';

const availableCanvas = [];

function getCanvas() {
    if (availableCanvas.length) {
        return availableCanvas.pop();
    }
    const canvas = document.createElement('canvas');
    return canvas;
}

/**
 * Build a texture atlas from N images.
 *
 * We use a classic 2D Bin Packing algorithm to assign each individual image a
 * location in the resulting texture.
 * Then this texture is created using a <canvas>,  onto which we draw all images.
 * In the end we return a THREE.CanvasTexture and an array 'uv' of Vector4, describing
 * the position/size of each input images in the atlas.
 * @param {array} images - an array of <img>
 * @param {array} uvs - an array of coordinates indicating what part of the image we should keep
 * @param {boolean} needsPixelSeparation - does this atlas need to use a anti color bleed pixel
 * between images
 * @return {THREE.CanvasTexture}
 */
export default {
    pack(maxSize, layerIds, imageSizes) {
        // pick an available canvas, or build a new one
        const atlasCanvas = getCanvas();

        // Use a 1 pixel border to avoid color bleed when sampling at the edges
        // of the texture
        const colorBleedHalfOffset = imageSizes.length == 1 ? 0 : 1;
        const blocks = [];

        for (let i = 0; i < imageSizes.length; i++) {
            const sWidth = imageSizes[i].w;
            const sHeight = imageSizes[i].h;

            blocks.push({
                layerId: layerIds[i],
                w: Math.min(maxSize, sWidth),
                h: Math.min(maxSize, sHeight + 2 * colorBleedHalfOffset),
            });
        }

        // sort from big > small images (the packing alg works best if big images are treated first)
        blocks.sort((a, b) => Math.max(a.w, a.h) < Math.max(b.w, b.h));

        const { maxX, maxY } = fit(blocks, maxSize, maxSize);

        const atlas = {};
        for (let i = 0; i < blocks.length; i++) {
            atlas[blocks[i].layerId] = blocks[i].fit;
        }

        return { atlas, maxX, maxY };
    },
};
