/**
 * @module sources/VectorTileSource
 */

import { CanvasTexture, Vector2 } from 'three';
import VectorTile from 'ol/source/VectorTile.js';
import { Style } from 'ol/style.js';

import TileState from 'ol/TileState.js';

import { listen, unlistenByKey } from 'ol/events.js';
import {
    createEmpty as createEmptyExtent,
    getIntersection, equals, buffer, intersects,
} from 'ol/extent.js';

// Even if it's not explicited in the changelog
// https://github.com/openlayers/openlayers/blob/main/changelog/upgrade-notes.md
// Around OL6 the replay group mechanism was split into BuilderGroup to create the
// instructions and ExecutorGroup to run them.
// The mechanism was altered following
// https://github.com/openlayers/openlayers/issues/9215
// to make it work

import CanvasBuilderGroup from 'ol/render/canvas/BuilderGroup.js';
import CanvasExecutorGroup from 'ol/render/canvas/ExecutorGroup.js';

import {
    getSquaredTolerance as getSquaredRenderTolerance,
    renderFeature as renderVectorFeature,
} from 'ol/renderer/vector.js';
import {
    Tile,
    VectorRenderTile,
} from 'ol';
import {
    create as createTransform,
    reset as resetTransform,
    scale as scaleTransform,
    translate as translateTransform,
} from 'ol/transform.js';
import TileSource from 'ol/source/Tile.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import Feature from 'ol/Feature.js';

import { MVT } from 'ol/format.js';
import FeatureFormat from 'ol/format/Feature.js';
import ImageSource, { ImageResult } from './ImageSource.js';
import OpenLayersUtils from '../utils/OpenLayersUtils.js';
import Extent from '../core/geographic/Extent.js';

const tmpTransform_ = createTransform();
const MIN_LEVEL_THRESHOLD = 2;
const tmpDims = new Vector2();

function getZoomLevel(tileGrid, width, extent) {
    const minZoom = tileGrid.getMinZoom();
    const maxZoom = tileGrid.getMaxZoom();

    function round1000000(n) {
        return Math.round(n * 100000000) / 100000000;
    }

    const extentWidth = extent.dimensions(tmpDims).x;
    const targetResolution = round1000000(width / extentWidth);

    const minResolution = round1000000(1 / tileGrid.getResolution(minZoom));

    if ((minResolution / targetResolution) > MIN_LEVEL_THRESHOLD) {
        // The minimum zoom level has more than twice the resolution
        // than requested. We cannot use this zoom level as it would
        // trigger too many tile requests to fill the extent.
        return null;
    }

    // Let's determine the best zoom level for the target tile.
    for (let z = minZoom; z < maxZoom; z++) {
        const sourceResolution = round1000000(1 / tileGrid.getResolution(z));

        if (sourceResolution >= targetResolution) {
            return z;
        }
    }

    return maxZoom;
}

function createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function handleStyleImageChange_() {
}

function renderFeature(feature, squaredTolerance, styles, builderGroup) {
    if (!styles) {
        return false;
    }
    let loading = false;
    if (Array.isArray(styles)) {
        for (let i = 0, ii = styles.length; i < ii; ++i) {
            loading = renderVectorFeature(
                builderGroup, feature, styles[i], squaredTolerance,
                handleStyleImageChange_, undefined,
            ) || loading;
        }
    } else {
        loading = renderVectorFeature(
            builderGroup, feature, styles, squaredTolerance,
            handleStyleImageChange_, undefined,
        );
    }
    return loading;
}

/**
 * @typedef {Function} StyleFunction
 * @param {Feature} feature - The feature to style.
 * @returns {Style} The OpenLayers [Style](https://openlayers.org/en/latest/apidoc/module-ol_style_Style-Style.html).
 */

/**
 * A Vector Tile source. Uses OpenLayers [styles](https://openlayers.org/en/latest/apidoc/module-ol_style_Style-Style.html).
 *
 * @example
 * const apiKey = 'my api key';
 * const vectorTileSource = new VectorTileSource({
 *     url: `${'https://{a-d}.tiles.mapbox.com/v4/mapbox.mapbox-streets-v6/'
 *         + '{z}/{x}/{y}.vector.pbf?access_token='}${apiKey}`,
 *     style: new Style(...), // Pass an OpenLayers style here
 *     backgroundColor: 'hsl(47, 26%, 88%)',
 * });
 * @api
 */
class VectorTileSource extends ImageSource {
    /**
     * @param {object} options Options.
     * @param {string} options.url The URL to the vector tile layer.
     * @param {string} options.targetProjection The target projection of the features.
     * @param {string} options.backgroundColor The background color of the tiles.
     * @param {FeatureFormat} [options.format] The format. Default is [MVT](https://openlayers.org/en/latest/apidoc/module-ol_format_MVT-MVT.html).
     * @param {Style|StyleFunction} options.style The style, or style function. The style must be an
     * OpenLayers [Style](https://openlayers.org/en/latest/apidoc/module-ol_style_Style-Style.html).
     * @param {import('./ImageSource.js').CustomContainsFn} [options.containsFn] The custom function
     * to test if a given extent is contained in this source.
     * @api
     */
    constructor(options) {
        super(options);
        if (!options.url) {
            throw new Error('missing parameter: url');
        }
        this.source = new VectorTile({
            url: options.url,
            format: options.format ?? new MVT(),
        });
        this.style = options.style;
        this.backgroundColor = options.backgroundColor;
        this.sourceProjection = null;
    }

    getExtent() {
        if (!this.extent) {
            const tileGrid = this.source.getTileGridForProjection(this.sourceProjection);
            const sourceExtent = tileGrid.getExtent();
            this.extent = OpenLayersUtils.fromOLExtent(sourceExtent, this.targetProjection);
        }
        return this.extent;
    }

    async initialize(options) {
        const source = this.source;
        this.targetProjection = options.targetProjection;
        const projection = source.getProjection();
        const tileGrid = source.getTileGridForProjection(projection);
        this.tileGrid = tileGrid;
        this.sourceProjection = projection;
        this.usedTiles = {};
    }

    /**
     * @param {VectorRenderTile} tile The tile to render.
     * @returns {HTMLCanvasElement} The canvas.
     */
    rasterize(tile) {
        const tileCoord = tile.getTileCoord();

        const width = 512;
        const height = 512;
        const canvas = createCanvas(width, height);
        const pixelRatio = 1;
        const replayState = tile.getReplayState(this);
        const revision = 1;
        replayState.renderedTileRevision = revision;

        const z = tileCoord[0];
        const source = this.source;
        const tileGrid = source.getTileGridForProjection(source.getProjection());
        const resolution = tileGrid.getResolution(z);
        const ctx = canvas.getContext('2d');

        if (this.backgroundColor) {
            ctx.fillStyle = this.backgroundColor;
            ctx.fillRect(
                0, 0,
                width, height,
            );
        }

        const tileExtent = tileGrid.getTileCoordExtent(tileCoord);
        const pixelScale = pixelRatio / resolution;
        const transform = resetTransform(tmpTransform_);
        scaleTransform(transform, pixelScale, -pixelScale);
        translateTransform(transform, -tileExtent[0], -tileExtent[3]);
        const executorGroups = tile.executorGroups[this.ol_uid];
        for (let i = 0, ii = executorGroups.length; i < ii; ++i) {
            const executorGroup = executorGroups[i];
            executorGroup.execute(ctx, 1, transform, 0, true);
        }

        ctx.restore();

        return canvas;
    }

    rasterizeTile(tile, tileExtent) {
        const empty = this.createBuilderGroup(tile);

        if (empty) {
            return null;
        }

        const canvas = this.rasterize(tile);
        const texture = new CanvasTexture(canvas);
        texture.extent = tileExtent;

        return texture;
    }

    createBuilderGroup(tile) {
        const replayState = tile.getReplayState(this);
        const source = this.source;
        const sourceTileGrid = source.getTileGrid();
        const sourceProjection = source.getProjection();
        const tileGrid = source.getTileGridForProjection(sourceProjection);
        const resolution = tileGrid.getResolution(tile.getTileCoord()[0]);
        const tileExtent = tileGrid.getTileCoordExtent(tile.wrappedTileCoord);
        const renderOrder = null;
        const pixelRatio = 1;

        const tmpExtent2 = createEmptyExtent();
        let empty = true;

        tile.executorGroups[this.ol_uid] = [];
        const sourceTiles = source.getSourceTiles(pixelRatio, sourceProjection, tile);
        for (let t = 0, tt = sourceTiles.length; t < tt; ++t) {
            const sourceTile = sourceTiles[t];
            if (sourceTile.getState() !== TileState.LOADED) {
                console.warn('not loaded !!!', sourceTile);
                continue;
            }
            const sourceTileCoord = sourceTile.getTileCoord();
            const sourceTileExtent = sourceTileGrid.getTileCoordExtent(sourceTileCoord);
            const sharedExtent = getIntersection(tileExtent, sourceTileExtent);
            const renderBuffer = 100;
            const builderExtent = buffer(sharedExtent, renderBuffer * resolution, tmpExtent2);
            const bufferedExtent = equals(sourceTileExtent, sharedExtent) ? null
                : builderExtent;

            const builderGroup = new CanvasBuilderGroup(0, builderExtent, resolution,
                pixelRatio);
            const squaredTolerance = getSquaredRenderTolerance(resolution, pixelRatio);

            const defaultStyle = this.style;

            const render = function render(feature) {
                let styles;
                const style = feature.getStyleFunction() || defaultStyle;
                if (typeof style === 'function') {
                    styles = style(feature, resolution);
                } else {
                    styles = defaultStyle;
                }
                if (styles) {
                    const dirty = renderFeature(feature, squaredTolerance, styles, builderGroup);
                    replayState.dirty = replayState.dirty || dirty;
                }
            };

            const features = sourceTile.getFeatures();
            if (renderOrder && renderOrder !== replayState.renderedRenderOrder) {
                features.sort(renderOrder);
            }

            for (let i = 0, ii = features.length; i < ii; ++i) {
                const feature = features[i];
                if (!bufferedExtent
                    || intersects(bufferedExtent, feature.getGeometry().getExtent())) {
                    render.call(this, feature);
                }
                empty = false;
            }
            if (!empty) {
                const renderingReplayGroup = new CanvasExecutorGroup(
                    builderExtent,
                    resolution,
                    pixelRatio,
                    source.getOverlaps(),
                    builderGroup.finish(),
                    renderBuffer,
                );
                tile.executorGroups[this.ol_uid].push(renderingReplayGroup);
            }
        }
        replayState.renderedRevision = 1;
        replayState.renderedRenderOrder = renderOrder;
        return empty;
    }

    /**
     * @param {Tile} tile The tile to load.
     * @param {Extent} tileExtent The extent of the tile.
     * @returns {Promise<HTMLCanvasElement>} The promise containing the rasterized tile.
     */
    loadTile(tile, tileExtent) {
        let promise;
        if (tile.getState() === TileState.EMPTY) {
            promise = Promise.resolve(null);
        } else if (tile.getState() === TileState.LOADED) {
            promise = Promise.resolve(this.rasterizeTile(tile, tileExtent));
        } else {
            promise = new Promise((resolve, reject) => {
                const eventKey = listen(tile, 'change', evt => {
                    const tile2 = evt.target;
                    const tileState = tile2.getState();
                    if (tileState === TileState.ERROR) {
                        unlistenByKey(eventKey);
                        reject();
                    } else if (tileState === TileState.LOADED) {
                        unlistenByKey(eventKey);
                        resolve(this.rasterizeTile(tile2, tileExtent));
                    }
                });
                tile.load();
            });
        }

        return promise;
    }

    /**
     * Loads all tiles in the specified extent and zoom level.
     *
     * @param {Extent} extent The tile extent.
     * @param {number} zoom The zoom level.
     * @returns {Array<{ id: string, request: function(()):Promise<ImageResult>}>} The image
     * requests.
     */
    loadTiles(extent, zoom) {
        /** @type {TileSource} */
        const source = this.source;
        /** @type {TileGrid} */
        const tileGrid = this.tileGrid;
        const crs = extent.crs();

        const requests = [];

        const sourceExtent = this.getExtent();

        tileGrid.forEachTileCoord(OpenLayersUtils.toOLExtent(extent), zoom, ([z, i, j]) => {
            const tile = source.getTile(z, i, j, 1, this.sourceProjection);
            const coord = tile.getTileCoord();
            const id = `${z}-${i}-${j}`;
            if (coord) {
                const tileExtent = OpenLayersUtils
                    .fromOLExtent(tileGrid.getTileCoordExtent(coord), crs);
                // Don't bother loading tiles that are not in the source
                if (tileExtent.intersectsExtent(sourceExtent)) {
                    const request = () => this.loadTile(tile, tileExtent)
                        .catch(e => {
                            console.error(e);
                        })
                        .then(texture => new ImageResult({ texture, extent: tileExtent, id }));
                    requests.push({ id, request });
                }
            }
        });

        return requests;
    }

    getImages(options) {
        const {
            extent, width,
        } = options;

        const tileGrid = this.source.getTileGridForProjection(this.sourceProjection);
        const zoomLevel = getZoomLevel(tileGrid, width, extent);

        if (zoomLevel == null) {
            return [];
        }

        return this.loadTiles(extent, zoomLevel);
    }
}

export default VectorTileSource;
