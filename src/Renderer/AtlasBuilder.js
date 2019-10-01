import fit from './Packer';

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
    pack(maxSize, layerIds, imageSizes, oldAtlas) {
        // pick an available canvas, or build a new one
        // const atlasCanvas = getCanvas();
        maxSize = 2048;
        // Use a 1 pixel border to avoid color bleed when sampling at the edges
        // of the texture
        const colorBleedHalfOffset = 0;// 1; // imageSizes.length == 1 ? 0 : 1;
        const blocks = [];

        for (let i = 0; i < imageSizes.length; i++) {
            if (oldAtlas && layerIds[i] in oldAtlas) {
                continue;
            }
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

        let previousRoot;
        if (oldAtlas) {
            for (const k in oldAtlas) { // eslint-disable-line guard-for-in
                const fit = oldAtlas[k];
                if (fit.x == 0 && fit.y == 0) {
                    // Updating
                    previousRoot = fit;
                    break;
                }
            }
        }
        if (oldAtlas && !previousRoot) {
            console.error('UH');
        }

        const { maxX, maxY } = fit(blocks, maxSize, maxSize, previousRoot);

        const atlas = oldAtlas || {};
        for (let i = 0; i < blocks.length; i++) {
            atlas[blocks[i].layerId] = blocks[i].fit;
            atlas[blocks[i].layerId].offset = colorBleedHalfOffset;
        }

        return { atlas, maxX, maxY };
    },
};
