/**
 * Class: RasterProvider
 * Description: Provides textures from a vector data
 */


import * as THREE from 'three';
import togeojson from '@mapbox/togeojson';
import Extent from '../Core/Geographic/Extent.js';
import Feature2Texture from '../Renderer/ThreeExtended/Feature2Texture.js';
import GeoJsonParser from '../Parser/GeoJsonParser.js';
import Fetcher from './Fetcher.js';
import Cache from '../Core/Scheduler/Cache.js';

function getExtentFromGpxFile(file) {
    const bound = file.getElementsByTagName('bounds')[0];
    if (bound) {
        const west = bound.getAttribute('minlon');
        const east = bound.getAttribute('maxlon');
        const south = bound.getAttribute('minlat');
        const north = bound.getAttribute('maxlat');
        return new Extent('EPSG:4326', west, east, south, north);
    }
    return new Extent('EPSG:4326', -180, 180, -90, 90);
}

function getKey(extent, layer) {
    return layer.id + extent.crs() + extent.west() + extent.east() + extent.north() + extent.west();
}
function createTextureFromVector(tile, layer) {
    if (!tile.material) {
        return Promise.resolve();
    }

    if (layer.type === 'color') {
        const coords = tile.extent;
        const result = { pitch: new THREE.Vector4(0, 0, 1, 1) };
        const key = getKey(tile.extent, layer);
        result.texture = Cache.get(key) || Cache.set(key, Feature2Texture.createTextureFromFeature(layer.feature, tile.extent, 256, layer.style));
        result.texture.extent = tile.extent;
        result.texture.coords = coords;
        result.texture.coords.zoom = tile.level;

        if (layer.transparent) {
            result.texture.premultiplyAlpha = true;
        }
        return Promise.resolve(result);
    }
    return Promise.resolve();
}

function _compareResultFromLevel(r1, r2) {
    return r2.object.level - r1.object.level;
}
function pickObjectsAt(view, mouse, radius) {
    // first find the coordinates (and so pick the tiles)
    // find the parent layer
    const parentLayer = view.getLayers(l => l.type === 'geometry' && l._attachedLayers.includes(this))[0];
    const results = view.pickObjectsAt(mouse, radius, parentLayer.level0Nodes[0]);
    if (results.length === 0) {
        return [];
    }
    // we also get lower level tiles, but we only need to examine the higher level tiles (the more precise ones)
    results.sort(_compareResultFromLevel);
    const highestLevel = results[0].object.level;
    const picked = [];
    for (const result of results) {
        if (result.object.level < highestLevel) {
            break; // we have examined all the precise tiles
        }
        const point = result.point;
        const pickedFeatures = Feature2Texture.featuresAtPoint(this.feature, result.object.extent, 256, this.style, point, radius);
        for (const f of pickedFeatures) {
            picked.push({ object: f, point, layer: this });
        }
    }
    return picked;
}

export default {
    preprocessDataLayer(layer, view, scheduler, parentLayer) {
        if (!layer.url && !layer.geojson) {
            throw new Error('One of layer.url or layer.geojson is required');
        }

        // KML and GPX specifications all says that they should be in
        // EPSG:4326. We still support reprojection for them through this
        // configuration option
        layer.projection = layer.projection || 'EPSG:4326';
        const parentCrs = parentLayer.extent.crs();

        if (!(layer.extent instanceof Extent)) {
            layer.extent = new Extent(layer.projection, layer.extent).as(parentCrs);
        }

        if (!layer.options.zoom) {
            layer.options.zoom = { min: 5, max: 21 };
        }

        layer.imageSize = { w: 256, h: 256 };
        layer.style = layer.style || {};

        // Rasterization of data vector
        // It shouldn't use parent's texture outside its extent
        // Otherwise artefacts appear at the outer edge
        layer.noTextureParentOutsideLimit = true;
        layer.pickObjectsAt = pickObjectsAt;

        // TODO implement this for every provider using Cache
        layer.clean = () => {
            Cache.deletePrefix(layer.id);
        };

        const geojsonPromise = layer.geojson ?
            Promise.resolve(layer.geojson)
            :
            Fetcher.text(layer.url, layer.networkOptions).then(text => {
                let geojson;
                const trimmedText = text.trim();
                // We test the start of the string to choose a parser
                if (trimmedText.startsWith('<')) {
                    // if it's an xml file, then it can be kml or gpx
                    const parser = new DOMParser();
                    const file = parser.parseFromString(text, 'application/xml');
                    if (file.documentElement.tagName.toLowerCase() === 'kml') {
                        geojson = togeojson.kml(file);
                    } else if (file.documentElement.tagName.toLowerCase() === 'gpx') {
                        geojson = togeojson.gpx(file);
                        layer.style.stroke = layer.style.stroke || 'red';
                        layer.extent = layer.extent.intersect(getExtentFromGpxFile(file).as(layer.extent.crs()));
                    } else if (file.documentElement.tagName.toLowerCase() === 'parsererror') {
                        throw new Error('Error parsing XML document');
                    } else {
                        throw new Error('Unsupported xml file, only valid KML and GPX are supported, but no <gpx> or <kml> tag found.',
                            file);
                    }
                } else if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
                    geojson = JSON.parse(text);
                    if (geojson.type !== 'Feature' && geojson.type !== 'FeatureCollection') {
                        throw new Error('This json is not a GeoJSON');
                    }
                } else {
                    throw new Error('Unsupported file: only well-formed KML, GPX or GeoJSON are supported');
                }
                return geojson;
            });

        return geojsonPromise.then(geojson => {
            if (!geojson) {
                return null; // TODO  is this really necessary?
            }
            const options = {
                buildExtent: true,
                crsIn: layer.projection,
                crsOut: parentCrs,
                filteringExtent: layer.extent,
                featureCb: layer.options.featureCb,
            };
            return GeoJsonParser.parse(geojson, options);
        }).then(feature => {
            if (Array.isArray(feature) && feature.length === 0) {
                return;
            }
            if (feature) {
                layer.feature = feature;
                layer.extent = feature.extent;
            }
        });
    },
    canTextureBeImproved(layer, extent, texture) {
        if (texture && texture.extent && texture.extent.isInside(extent)) {
            return false;
        }
        return extent;
    },
    tileInsideLimit(tile, layer) {
        const extent = tile.getExtentForLayer(layer);
        return layer.extent.intersectsExtent(extent);
    },
    executeCommand(command) {
        const layer = command.layer;
        const tile = command.requester;

        return createTextureFromVector(tile, layer);
    },
};
