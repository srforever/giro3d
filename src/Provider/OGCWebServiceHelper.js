import * as THREE from 'three';
import Fetcher from './Fetcher.js';
import Cache from '../Core/Scheduler/Cache.js';
import Projection from '../Core/Geographic/Projection.js';
import Extent from '../Core/Geographic/Extent.js';

export const SIZE_TEXTURE_TILE = 256;

const getTextureFloat = function getTextureFloat(buffer) {
    const texture = new THREE.DataTexture(
        buffer, SIZE_TEXTURE_TILE, SIZE_TEXTURE_TILE, THREE.AlphaFormat, THREE.FloatType,
    );
    texture.needsUpdate = true;
    return texture;
};

const tileCoord = new Extent('WMTS:WGS84G', 0, 0, 0);

export default {
    getColorTextureByUrl(url, networkOptions) {
        return Cache.get(url) || Cache.set(url, Fetcher.texture(url, networkOptions)
            .then(texture => {
                texture.generateMipmaps = false;
                texture.magFilter = THREE.LinearFilter;
                texture.minFilter = THREE.LinearFilter;
                texture.anisotropy = 16;
                return texture;
            }), Cache.POLICIES.TEXTURE);
    },
    getXBilTextureByUrl(url, networkOptions) {
        return Cache.get(url) || Cache.set(url, Fetcher.arrayBuffer(url, networkOptions)
            .then(buffer => {
                const texture = getTextureFloat(buffer);
                texture.generateMipmaps = false;
                texture.magFilter = THREE.LinearFilter;
                texture.minFilter = THREE.LinearFilter;
                return texture;
            }), Cache.POLICIES.TEXTURE);
    },
    computeTileMatrixSetCoordinates(tile, tileMatrixSet) {
        tileMatrixSet = tileMatrixSet || 'WGS84G';
        if (!(tileMatrixSet in tile.wmtsCoords)) {
            if (tile.wmtsCoords.WGS84G) {
                const c = tile.wmtsCoords.WGS84G[0];
                tileCoord.zoom = c.zoom;
                tileCoord.col = c.col;
                tileCoord.row = c.row;
            } else {
                Projection.WGS84toWMTS(tile.extent, tileCoord);
                tile.wmtsCoords.WGS84G = [tileCoord.clone()];
            }

            tile.wmtsCoords[tileMatrixSet] =
                Projection.getCoordWMTS_WGS84(tileCoord, tile.extent, tileMatrixSet);
        }
    },
    // The origin parameter is to be set to the correct value, bottom or top
    // (default being bottom) if the computation of the coordinates needs to be
    // inverted to match the same scheme as OSM, Google Maps or other system.
    // See link below for more information
    // https://alastaira.wordpress.com/2011/07/06/converting-tms-tile-coordinates-to-googlebingosm-tile-coordinates/
    computeTMSCoordinates(tileExtent, extent, origin = 'bottom') {
        if (tileExtent.crs() !== extent.crs()) {
            throw new Error('Unsupported configuration. TMS is only supported when geometry has the same crs than TMS layer');
        }
        const c = tileExtent.center();
        const layerDimension = extent.dimensions();

        // Each level has 2^n * 2^n tiles...
        // ... so we count how many tiles of the same width as tile we can fit in the layer
        const tileCount = Math.round(layerDimension.x / tileExtent.dimensions().x);
        // ... 2^zoom = tilecount => zoom = log2(tilecount)
        const zoom = Math.floor(Math.log2(tileCount));

        // Now that we have computed zoom, we can deduce x and y (or row / column)
        const x = (c.x() - extent.west()) / layerDimension.x;
        let y;
        if (origin === 'top') {
            y = (extent.north() - c.y()) / layerDimension.y;
        } else {
            y = (c.y() - extent.south()) / layerDimension.y;
        }

        return [new Extent('TMS', zoom, Math.floor(y * tileCount), Math.floor(x * tileCount))];
    },
    WMTS_WGS84Parent(cWMTS, levelParent, pitch, target = new Extent(cWMTS.crs(), 0, 0, 0)) {
        const diffLevel = cWMTS.zoom - levelParent;
        const diff = Math.pow(2, diffLevel);
        const invDiff = 1 / diff;

        const r = (cWMTS.row - (cWMTS.row % diff)) * invDiff;
        const c = (cWMTS.col - (cWMTS.col % diff)) * invDiff;

        if (pitch) {
            pitch.x = cWMTS.col * invDiff - c;
            pitch.y = cWMTS.row * invDiff - r;
            pitch.z = invDiff;
            pitch.w = invDiff;
        }

        return target.set(target.crs(), levelParent, r, c);
    },
};
