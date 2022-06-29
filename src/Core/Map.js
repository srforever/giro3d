/**
 * @module Core/Map
 */
import * as THREE from 'three';

import Coordinates from './Geographic/Coordinates.js';
import Extent from './Geographic/Extent.js';
import Layer, { defineLayerProperty } from './Layer/Layer.js';
import GeometryLayer from './Layer/GeometryLayer.js';
import { STRATEGY_MIN_NETWORK_TRAFFIC } from './Layer/LayerUpdateStrategy.js';
import PlanarTileBuilder from './Prefab/Planar/PlanarTileBuilder.js';
import ColorTextureProcessing from '../Process/ColorTextureProcessing.js';
import ElevationTextureProcessing, { minMaxFromTexture } from '../Process/ElevationTextureProcessing.js';
import ObjectRemovalHelper from '../Process/ObjectRemovalHelper.js';
import { ELEVATION_FORMAT } from '../utils/DEMUtils.js';

function findCellWith(x, y, layerDimension, tileCount) {
    const tx = (tileCount * x) / layerDimension.x;
    const ty = (tileCount * y) / layerDimension.y;
    // if the user configures an extent with exact same dimension as the "reference" extent of the
    // crs, they won't expect this function to return the tile immediately to the bottom right.
    // therefore, if tx or ty is exactly one, we need to give back 0 instead.  we consider inclusive
    // bounds actually.
    return { x: tx === 1 ? 0 : Math.floor(tx), y: ty === 1 ? 0 : Math.floor(ty) };
}

// return the 3857 tile that fully contains the given extent
function compute3857Extent(tileExtent) {
    const extent = new Extent('EPSG:3857',
        -20037508.342789244, 20037508.342789244,
        -20037508.342789244, 20037508.342789244);
    const layerDimension = extent.dimensions();

    // Each level has 2^n * 2^n tiles...
    // ... so we count how many tiles of the same width as tile we can fit in the layer
    const tileCount = Math.min(
        Math.floor(layerDimension.x / tileExtent.dimensions().x),
        Math.floor(layerDimension.y / tileExtent.dimensions().y),
    );
    // ... 2^zoom = tilecount => zoom = log2(tilecount)
    const zoom = Math.floor(Math.max(0, Math.log2(tileCount)));

    const tl = new Coordinates('EPSG:3857', tileExtent.west(), tileExtent.north());
    const br = new Coordinates('EPSG:3857', tileExtent.east(), tileExtent.south());
    const realTileCount = 2 ** zoom;

    // compute tile that contains the center
    const topLeft = findCellWith(
        tl.x() - extent.west(), extent.north() - tl.y(),
        layerDimension, realTileCount,
    );
    const bottomRight = findCellWith(
        br.x() - extent.west(), extent.north() - br.y(),
        layerDimension, realTileCount,
    );

    const tileSize = {
        x: layerDimension.x / realTileCount,
        y: layerDimension.y / realTileCount,
    };

    const extents = [];
    for (let i = topLeft.x; i <= bottomRight.x; i++) {
        for (let j = topLeft.y; j <= bottomRight.y; j++) {
            const west = extent.west() + i * tileSize.x;
            const north = extent.north() - j * tileSize.y;

            extents.push(new Extent('EPSG:3857',
                west, west + tileSize.x,
                north - tileSize.y, north));
        }
    }
    return extents;
}

function findSmallestExtentCoveringGoingDown(node, extent) {
    if (node.children) {
        for (const c of node.children) {
            if (c.extent) {
                if (extent.isInside(c.extent)) {
                    return findSmallestExtentCoveringGoingDown(c, extent);
                }
            }
        }
    }
    return [node, extent];
}

function findSmallestExtentCoveringGoingUp(node, extent) {
    if (extent.isInside(node.extent)) {
        return node;
    }
    if (!node.parent || !node.parent.extent) {
        if (node.level === 0 && node.parent.children.length) {
            for (const sibling of node.parent.children) {
                if (sibling.extent
                    && extent.isInside(sibling.extent)) {
                    return sibling;
                }
            }
        }
        return undefined;
    }
    return findSmallestExtentCoveringGoingUp(node.parent, extent);
}

function findSmallestExtentCovering(node, extent) {
    const n = findSmallestExtentCoveringGoingUp(node, extent);
    if (!n) {
        return null;
    }
    return findSmallestExtentCoveringGoingDown(n, extent);
}

function findNeighbours(node) {
    // top, right, bottom, left
    const borders = node.extent.externalBorders(0.1);
    return borders.map(border => findSmallestExtentCovering(node, border));
}

/**
 * a Map object: base object to add map layers
 *
 * @api
 */
class Map extends GeometryLayer {
    /**
     * Constructs a Map object.
     *
     * @param {string} id The unique identifier of the Map
     * @param {object=} options Optional properties.
     * @param {Extent} options.extent geographic extent of the map
     * @param {Extent} options.maxSubdivisionLevel Maximum subdivision level of the current map
     * @api
     */
    constructor(id, options = {}) {
        super(id, new THREE.Group());

        const extent = options.extent;
        const crs = Array.isArray(extent) ? extent[0].crs() : extent.crs();

        this.validityExtent = extent;
        if (crs === 'EPSG:3857') {
            // align quadtree on EPSG:3857 full extent
            const aligned = compute3857Extent(extent);
            this.schemeTile = aligned;
        } else if (Array.isArray(extent)) {
            this.schemeTile = extent;
        } else {
            this.schemeTile = [extent];
        }
        this.extent = this.schemeTile[0].clone();
        for (let i = 1; i < this.schemeTile.length; i++) {
            this.extent.union(this.schemeTile[i]);
        }

        this.sseScale = 1.5;
        this.maxSubdivisionLevel = options.maxSubdivisionLevel;

        // TODO make that a class method ?
        this.postUpdate = (context, layer) => {
            for (const r of layer.level0Nodes) {
                r.traverse(node => {
                    if (node.layer !== layer || !node.material.visible) {
                        return;
                    }
                    node.material.uniforms.neighbourdiffLevel.value.set(0, 0, 0, 1);
                    const n = findNeighbours(node);
                    if (n) {
                        const dimensions = node.extent.dimensions();
                        const elevationNeighbours = node.material.texturesInfo.elevation.neighbours;
                        for (let i = 0; i < 4; i++) {
                            if (!n[i] || !n[i][0].material.visible) {
                                // neighbour is missing or smaller => don't do anything
                                node.material.uniforms
                                    .neighbourdiffLevel.value.setComponent(i, 1);
                            } else {
                                const nn = n[i][0];
                                const targetExtent = n[i][1];

                                // We want to compute the diff level, but can't directly
                                // use nn.level - node.level, because there's no garuantee
                                // that we're on a regular grid.
                                // The only thing we can assume is their shared edge are
                                // equal with a power of 2 factor.
                                const diff = Math.log2((i % 2)
                                    ? Math.round(nn.extent.dimensions().y / dimensions.y)
                                    : Math.round(nn.extent.dimensions().x / dimensions.x));

                                node.material.uniforms
                                    .neighbourdiffLevel.value.setComponent(i, -diff);
                                elevationNeighbours.texture[i] = nn
                                    .material
                                    .texturesInfo
                                    .elevation
                                    .texture;

                                const offscale = targetExtent.offsetToParent(nn.extent);

                                elevationNeighbours.offsetScale[i] = nn
                                    .material
                                    .texturesInfo
                                    .elevation
                                    .offsetScale
                                    .clone();

                                elevationNeighbours.offsetScale[i].x
                                    += offscale.x * elevationNeighbours.offsetScale[i].z;
                                elevationNeighbours.offsetScale[i].y
                                    += offscale.y * elevationNeighbours.offsetScale[i].w;
                                elevationNeighbours.offsetScale[i].z *= offscale.z;
                                elevationNeighbours.offsetScale[i].w *= offscale.w;
                            }
                        }
                    }
                });
            }
        };

        this.builder = new PlanarTileBuilder();
        this.protocol = 'tile';
        this.visible = true;
        this.lighting = {
            enable: false,
            position: { x: -0.5, y: 0.0, z: 1.0 },
        };
    }

    // TODO this whole function should be either in providers or in layers
    _preprocessLayer(layer, provider) {
        if (!(layer instanceof Layer) && !(layer instanceof GeometryLayer)) {
            const nlayer = new Layer(layer.id);
            // nlayer.id is read-only so delete it from layer before Object.assign
            const tmp = layer;
            delete tmp.id;
            layer = Object.assign(nlayer, layer);
            // restore layer.id in user provider layer object
            tmp.id = layer.id;
        }

        layer.options = layer.options || {};

        if (!layer.updateStrategy) {
            layer.updateStrategy = {
                type: STRATEGY_MIN_NETWORK_TRAFFIC,
            };
        }

        if (provider) {
            if (provider.tileInsideLimit) {
                layer.tileInsideLimit = provider.tileInsideLimit.bind(provider);
            }
            if (provider.getPossibleTextureImprovements) {
                layer.getPossibleTextureImprovements = provider
                    .getPossibleTextureImprovements
                    .bind(provider);
            }
            if (provider.tileTextureCount) {
                layer.tileTextureCount = provider.tileTextureCount.bind(provider);
            }
        }

        if (!layer.whenReady) {
            let providerPreprocessing = Promise.resolve();
            if (provider && provider.preprocessDataLayer) {
                providerPreprocessing = provider.preprocessDataLayer(
                    layer, this._instance, this._instance.mainLoop.scheduler, this,
                );
                if (!(providerPreprocessing && providerPreprocessing.then)) {
                    providerPreprocessing = Promise.resolve();
                }
            }

            if (layer.type === 'elevation') {
                providerPreprocessing = providerPreprocessing.then(() => {
                    const down = provider.getPossibleTextureImprovements(layer, layer.extent);
                    return provider.executeCommand({
                        layer,
                        toDownload: down,
                    }).then(result => {
                        const minmax = minMaxFromTexture(layer, result.texture, result.pitch);
                        result.texture.min = minmax.min;
                        result.texture.max = minmax.max;
                        layer.minmax = minmax;
                    });
                });
            }

            // the last promise in the chain must return the layer
            layer.whenReady = providerPreprocessing.then(() => {
                if (layer.type === 'elevation') {
                    if (!layer.minmax) {
                        throw new Error('At this point the whole min/max should be known');
                    }
                    this.object3d.traverse(n => {
                        if (n.setBBoxZ) {
                            n.setBBoxZ(layer.minmax.min, layer.minmax.max);
                        }
                    });
                }

                layer.ready = true;
                return layer;
            });
        }

        // probably not the best place to do this
        if (layer.type === 'color') {
            defineLayerProperty(layer, 'frozen', false);
            defineLayerProperty(layer, 'visible', true);
            defineLayerProperty(layer, 'opacity', 1.0);
            defineLayerProperty(layer, 'sequence', 0);
        } else if (layer.type === 'elevation') {
            defineLayerProperty(layer, 'frozen', false);
        }
        return layer;
    }

    /**
     * @param {object} layer an object describing the layer options creation
     * @param {string} layer.id the unique identifier of the layer
     * @param {string} layer.type the layer type (<code>'color'</code> or <code>'elevation'</code>)
     * @param {Extent} layer.extent the layer extent
     * @param {string=} layer.projection the optional layer projection.
     * If none, defaults to the map's projection.
     * @param {string} [layer.protocol=undefined] the optional layer protocol. Can be any of:
     * - <code>'tile'</code>
     * - <code>'wms'</code>
     * - <code>'3d-tiles'</code>
     * - <code>'tms'</code>
     * - <code>'xyz'</code>
     * - <code>'potreeconverter'</code>
     * - <code>'wfs'</code>
     * - <code>'rasterizer'</code>
     * - <code>'static'</code>
     * - <code>'oltile'</code>
     * - <code>'olvectortile'</code>
     * - <code>'olvector'</code>
     * @param {string} layer.elevationFormat if layer.type is<code>'elevation'</code>,
     * specifies the elevation format.
     * @param {string} layer.update the update function of this layer.If none provided,
     * use default update functions for color and elevation layers
     * (depending on <code>layer.elevationFormat</code>).
     * @param {string} layer.heightFieldOffset if <code>layer.type</code> is<code>'elevation'</code>
     * and <code>layer.elevationFormat</code> is <code>ELEVATION_FORMAT.HEIGHFIELD</code>,
     * specifies the offset to use for scalar values in the height field. Default is <code>0</code>.
     * @param {string} layer.heightFieldScale if <code>layer.type</code> is<code>'elevation'</code>
     * and <code>layer.elevationFormat</code> is <code>ELEVATION_FORMAT.HEIGHFIELD</code>,
     * specifies the scale to use for scalar values in the height field.
     * Default is <code>255</code>.
     * @returns {Layer} a promise resolving when the layer is ready
     * @api
     */
    addLayer(layer) {
        if (layer.type === 'color') {
            layer.update = layer.update || ColorTextureProcessing.updateLayerElement;
        } else if (layer.type === 'elevation') {
            layer.update = layer.update || ElevationTextureProcessing.updateLayerElement;
            if (layer.elevationFormat === ELEVATION_FORMAT.HEIGHFIELD) {
                layer.heightFieldOffset = layer.heightFieldOffset || 0;
                layer.heightFieldScale = layer.heightFieldScale || 255;
            }
        }

        return new Promise((resolve, reject) => {
            if (!layer) {
                reject(new Error('layer is undefined'));
                return;
            }
            const duplicate = this._instance.getLayers((l => l.id === layer.id));
            if (duplicate.length > 0) {
                reject(new Error(`Invalid id '${layer.id}': id already used`));
                return;
            }

            if (!layer.extent) {
                layer.extent = this.extent;
            }

            const provider = this._instance.mainLoop.scheduler.getProtocolProvider(layer.protocol);
            if (layer.protocol && !provider) {
                reject(new Error(`${layer.protocol} is not a recognized protocol name.`));
                return;
            }

            layer = this._preprocessLayer(layer, provider);

            if (!layer.projection) {
                layer.projection = this.projection;
            }

            layer.whenReady.then(l => {
                if (l.type === 'elevation') {
                    this.minMaxFromElevationLayer = {
                        min: l.minmax.min,
                        max: l.minmax.max,
                    };
                    for (const node of this.level0Nodes) {
                        node.traverse(n => {
                            if (n.setBBoxZ) {
                                n.setBBoxZ(
                                    this.minMaxFromElevationLayer.min,
                                    this.minMaxFromElevationLayer.max,
                                );
                            }
                        });
                    }
                }

                this.attach(l);

                this._instance.notifyChange(this, false);
                resolve(l);
            });
        });
    }

    /**
     * Removes a layer from the map.
     *
     * @param {object} layer the layer to remove
     * @api
     */
    removeLayer(layer) {
        if (layer.object3d) {
            ObjectRemovalHelper.removeChildrenAndCleanupRecursively(layer, layer.object3d);
            this.scene.remove(layer.object3d);
        }
        const parentLayer = this.getLayers(
            l => l._attachedLayers && l._attachedLayers.includes(layer),
        )[0];
        if (parentLayer) {
            parentLayer.detach(layer);
        }
        this._cleanLayer(layer);
        // TODO clean also this layer's children
        this.notifyChange(parentLayer || this._instance.camera.camera3D, true);
    }

    /**
     * Gets all layers that satisfy the filter predicate
     *
     * @api
     * @param {Function} [filter] the optional filter
     * @returns {Array<object>} the layers that matched the predicate,
     * or all layers if no predicate was provided.
     */
    getLayers(filter) {
        const result = [];
        for (const layer of this._attachedLayers) {
            if (!filter || filter(layer)) {
                result.push(layer);
            }
        }
        return result;
    }

    /**
     * Clean all layers in the map.
     *
     * @api
     */
    clean() {
        for (const l of this.getLayers()) {
            this._cleanLayer(l);
        }
    }

    _cleanLayer(layer) {
        // XXX do providers needs to clean their layers ? Usually it's just some properties
        // initialisation...  - YES they do, because Providers use Cache, and they know which key
        // they use. (this behaviour is dangerous and we should change this)
        if (layer.type === 'color') {
            ColorTextureProcessing.cleanLayer(layer, this);
        } else if (layer.type === 'elevation') {
            // TODO
            // ElevationTextureProcessing.clean(layer, parentLayer.object3d);
        }
    }
}

export default Map;
