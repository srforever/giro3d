import * as THREE from 'three';
import Fetcher from './Fetcher.js';
import Cache from '../Core/Scheduler/Cache.js';
import VectorTileParser from '../Parser/VectorTileParser.js';
import Feature2Texture from '../Renderer/ThreeExtended/Feature2Texture.js';
import Extent from '../Core/Geographic/Extent.js';
import TileMesh from '../Core/TileMesh.js';
import Layer from '../Core/Layer/Layer.js';

const getVectorTileByUrl = function getVectorTileByUrl(url, tile, layer, coords) {
    return Fetcher.arrayBuffer(url, layer.networkOptions)
        .then(buffer => VectorTileParser.parse(buffer, {
            extent: tile.extent,
            filteringExtent: layer.extent,
            filter: layer.filter,
            origin: layer.origin,
            coords,
        }));
};

/**
 * @module VectorTileHelper
 */
export default {
    /**
     * Get a vector tile file, parse it and return a [FeatureCollection]{@link
     * module:GeoJsonParser.FeatureCollection}. See [VectorTileParser]{@link
     * module:VectorTileParser.parse} for more details on the parsing.
     *
     * @param {string} url - The URL of the tile to fetch, NOT the template: use a
     * Provider instead if needed.
     * @param {TileMesh} tile
     * @param {Layer|object} layer - A Layer to associate to the tile or an
     * object containing the necessary properties from the layer.
     * @param {Extent} layer.extent - The Extent to convert the input coordinates to.
     * outside of this extent.
     * @param {Function=} layer.filter - Filter function to remove features.
     * @param {string=} layer.origin - This option is to be set to the correct
     * value, bottom or top (default being bottom), if the computation of the
     * coordinates needs to be inverted to same scheme as OSM, Google Maps or
     * other system. See [this link]{@link https://alastaira.wordpress.com/2011/07/06/converting-tms-tile-coordinates-to-googlebingosm-tile-coordinates} for more informations.
     * @param {Extent} coords
     * @returns {Promise} A Promise resolving with a Feature Collection.
     * @function
     */
    getVectorTileByUrl,

    /**
     * Get a vector tile, parse it and return a [THREE.Texture]{@link https://threejs.org/docs/#api/textures/Texture}.
     *
     * @param {string} url - The URL of the tile to fetch, NOT the template: use a
     * Provider instead if needed.
     * @param {TileMesh} tile the tile to fetch
     * @param {Layer} layer the layer of the vector tile
     * @param {Extent} coords the extent of the tile
     * @returns {object} Contains a <code>texture</code> property that is the
     * resulting texture of the vector tile.
     */
    getVectorTileTextureByUrl(url, tile, layer, coords) {
        if (layer.type !== 'color') return null;

        return Cache.get(url) || Cache.set(url, getVectorTileByUrl(url, tile, layer, coords)
            .then(features => {
                const backgroundColor = (layer.backgroundLayer && layer.backgroundLayer.paint)
                    ? new THREE.Color(layer.backgroundLayer.paint['background-color'])
                    : undefined;

                let extentTexture;
                switch (coords.crs()) {
                    case 'TMS':
                        extentTexture = tile.extent;
                        break;
                    case 'WMTS:PM':
                        extentTexture = coords.as('EPSG:3857');
                        break;
                    default:
                        extentTexture = coords.as(tile.extent.crs());
                }

                const texture = Feature2Texture.createTextureFromFeature(
                    features,
                    extentTexture,
                    256,
                    layer.style,
                    backgroundColor,
                );

                texture.extent = tile.extent;
                texture.coords = coords;

                return texture;
            }));
    },
};
