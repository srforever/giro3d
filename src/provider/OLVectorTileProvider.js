import {
    CanvasTexture,
    Texture,
    Vector2,
    Vector4,
    WebGLRenderer,
} from 'three';

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
    Fill, Icon, Stroke, Style, Text,
} from 'ol/style.js';
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

import TileGrid from 'ol/tilegrid/TileGrid.js';
import TileSource from 'ol/source/Tile.js';

import DataStatus from './DataStatus.js';
import Extent from '../core/geographic/Extent.js';
import { GlobalCache } from '../core/Cache.js';
import Rect from '../core/Rect.js';
import OpenLayersUtils from '../utils/OpenLayersUtils.js';
import WebGLComposer from '../renderer/composition/WebGLComposer.js';

const tmpTransform_ = createTransform();

const MIN_LEVEL_THRESHOLD = 2;

function preprocessDataLayer(layer) {
    const { source } = layer;
    const projection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(projection);
    layer.tileGrid = tileGrid;
    layer.olprojection = projection;
    layer.getStyleFunction = () => layer.style(Style, Fill, Stroke, Icon, Text);
    layer.usedTiles = {};
}

function getPossibleTextureImprovements({
    layer,
    extent,
    texture,
    size,
}) {
    if (!extent.intersectsExtent(layer.extent)) {
        // The tile does not even overlap with the layer extent.
        // This can happen when layers have a different extent from their parent map.
        return DataStatus.DATA_UNAVAILABLE;
    }

    if (texture && texture.extent
        && texture.extent.isInside(extent)
        && texture.revision === layer.source.getRevision()) {
        return DataStatus.DATA_ALREADY_LOADED;
    }

    const { source } = layer;
    const projection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(projection);
    const zoomLevel = getZoomLevel(tileGrid, size, extent);

    return { zoomLevel, extent, size };
}

function getZoomLevel(tileGrid, imageSize, extent) {
    const olExtent = OpenLayersUtils.toOLExtent(extent);
    const minZoom = tileGrid.getMinZoom();
    const maxZoom = tileGrid.getMaxZoom();

    const extentWidth = olExtent[2] - olExtent[0];
    const targetResolution = imageSize.width / extentWidth;

    const minResolution = 1 / tileGrid.getResolution(minZoom);

    if ((minResolution / targetResolution) > MIN_LEVEL_THRESHOLD) {
        // The minimum zoom level has more than twice the resolution
        // than requested. We cannot use this zoom level as it would
        // trigger too many tile requests to fill the extent.
        return DataStatus.DATA_UNAVAILABLE;
    }

    // Let's determine the best zoom level for the target tile.
    for (let z = minZoom; z < maxZoom; z++) {
        const sourceResolution = 1 / tileGrid.getResolution(z);

        if (sourceResolution >= targetResolution) {
            return z;
        }
    }

    return maxZoom;
}

async function executeCommand(instance, layer, requester, toDownload) {
    const {
        zoomLevel,
        extent,
        pitch,
        size,
    } = toDownload;
    const images = await loadTiles(extent, zoomLevel, layer);
    const result = combineImages(images, instance.renderer, pitch, layer, extent, size);
    return result;
}

/**
 * Combines all images into a single texture.
 *
 * @param {Array} sourceImages The images to combine.
 * @param {WebGLRenderer} renderer The WebGL renderer.
 * @param {Vector4} pitch The custom pitch.
 * @param {module:Core/layer/Layer~Layer} layer The target layer.
 * @param {Extent} targetExtent The extent of the destination texture.
 * @param {Vector2} size The texture size.
 */
function combineImages(sourceImages, renderer, pitch, layer, targetExtent, size) {
    const composer = new WebGLComposer({
        extent: Rect.fromExtent(targetExtent),
        width: size.width,
        height: size.height,
        webGLRenderer: renderer,
        showImageOutlines: layer.showTileBorders || false,
    });

    const options = { interpretation: layer.interpretation };

    sourceImages.forEach(img => {
        if (img) {
            composer.draw(img, Rect.fromExtent(img.extent), options);
        }
    });

    const texture = composer.render();
    texture.extent = targetExtent;
    texture.revision = layer.source.getRevision();

    composer.dispose();

    return { texture, pitch: pitch ?? new Vector4(0, 0, 1, 1) };
}

/**
 * Loads all tiles in the specified extent and zoom level.
 *
 * @param {Extent} extent The tile extent.
 * @param {number} zoom The zoom level.
 * @param {module:Core/layer/Layer~Layer} layer The target layer.
 * @returns {Promise<HTMLImageElement[]>} The loaded tile images.
 */
function loadTiles(extent, zoom, layer) {
    /** @type {TileSource} */
    const source = layer.source;
    /** @type {TileGrid} */
    const tileGrid = layer.tileGrid;
    const crs = extent.crs();

    const promises = [];

    tileGrid.forEachTileCoord(OpenLayersUtils.toOLExtent(extent), zoom, ([z, i, j]) => {
        const tile = source.getTile(z, i, j, 1, layer.olprojection);
        const coord = tile.getTileCoord();
        if (coord) {
            const tileExtent = OpenLayersUtils
                .fromOLExtent(tileGrid.getTileCoordExtent(coord), crs);
            // Don't bother loading tiles that are not in the layer
            if (tileExtent.intersectsExtent(layer.extent)) {
                const promise = loadTile(tile, tileExtent, layer).catch(e => {
                    console.error(e);
                });
                promises.push(promise);
            }
        }
    });

    return Promise.all(promises);
}

/**
 * Dispose the texture contained in the promise.
 *
 * @param {Promise<Texture>} promise The texture promise.
 */
function onDelete(promise) {
    promise.then(t => t.dispose());
    promise.catch(e => console.error(e));
}

/**
 * @param {Tile} tile The tile to load.
 * @param {Extent} tileExtent The extent of the tile.
 * @param {module:Core/layer/Layer~Layer} layer The layer.
 * @returns {Promise<HTMLCanvasElement>} The promise containing the rasterized tile.
 */
function loadTile(tile, tileExtent, layer) {
    const tileCoord = tile.getTileCoord();
    const key = `vectortile-${layer.id}-${tileCoord[0]},${tileCoord[1]},${tileCoord[2]}`;

    const cached = GlobalCache.get(key);

    if (cached) {
        return cached;
    }

    let promise;
    if (tile.getState() === TileState.EMPTY) {
        promise = Promise.resolve(null);
    } else if (tile.getState() === TileState.LOADED) {
        promise = Promise.resolve(rasterizeTile(tile, tileExtent, layer));
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
                    resolve(rasterizeTile(tile2, tileExtent, layer));
                }
            });
            tile.load();
        });
    }

    GlobalCache.set(key, promise, { onDelete });

    return promise;
}

function rasterizeTile(tile, tileExtent, layer) {
    const empty = createBuilderGroup(tile, layer);

    if (empty) {
        return null;
    }

    const canvas = rasterize(tile, layer);
    const texture = new CanvasTexture(canvas);
    texture.extent = tileExtent;

    return texture;
}

function createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function createBuilderGroup(tile, layer) {
    const replayState = tile.getReplayState(layer);
    const { source } = layer;
    const sourceTileGrid = source.getTileGrid();
    const sourceProjection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(sourceProjection);
    const resolution = tileGrid.getResolution(tile.getTileCoord()[0]);
    const tileExtent = tileGrid.getTileCoordExtent(tile.wrappedTileCoord);
    const renderOrder = null;
    const pixelRatio = 1;

    const tmpExtent = createEmptyExtent();
    let empty = true;

    tile.executorGroups[layer.ol_uid] = [];
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
        const builderExtent = buffer(sharedExtent, renderBuffer * resolution, tmpExtent);
        const bufferedExtent = equals(sourceTileExtent, sharedExtent) ? null
            : builderExtent;

        const builderGroup = new CanvasBuilderGroup(0, builderExtent, resolution,
            pixelRatio);
        const squaredTolerance = getSquaredRenderTolerance(resolution, pixelRatio);

        const render = function render(feature) {
            let styles;
            const styleFunction = feature.getStyleFunction() || layer.getStyleFunction();
            if (styleFunction) {
                styles = styleFunction(feature, resolution);
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
            if (!bufferedExtent || intersects(bufferedExtent, feature.getGeometry().getExtent())) {
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
            tile.executorGroups[layer.ol_uid].push(renderingReplayGroup);
        }
    }
    replayState.renderedRevision = 1;
    replayState.renderedRenderOrder = renderOrder;
    return empty;
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

function handleStyleImageChange_() {
}

/**
 * @param {VectorRenderTile} tile The tile to render.
 * @param {module:Core/layer/Layer~Layer} layer The layer.
 * @returns {HTMLCanvasElement} The canvas.
 */
function rasterize(tile, layer) {
    const tileCoord = tile.getTileCoord();

    const width = 512;
    const height = 512;
    const canvas = createCanvas(width, height);
    const pixelRatio = 1;
    const replayState = tile.getReplayState(layer);
    const revision = 1;
    replayState.renderedTileRevision = revision;

    const z = tileCoord[0];
    const { source } = layer;
    const tileGrid = source.getTileGridForProjection(source.getProjection());
    const resolution = tileGrid.getResolution(z);
    const ctx = canvas.getContext('2d');

    if (layer.backgroundColor) {
        ctx.fillStyle = layer.backgroundColor;
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
    const executorGroups = tile.executorGroups[layer.ol_uid];
    for (let i = 0, ii = executorGroups.length; i < ii; ++i) {
        const executorGroup = executorGroups[i];
        executorGroup.execute(ctx, 1, transform, 0, true);
    }

    ctx.restore();

    return canvas;
}

function tileInsideLimit(tile, layer) {
    const extent = tile.getExtentForLayer(layer).as(layer.extent.crs());
    return extent.isInside(layer.extent);
}

export default {
    preprocessDataLayer,
    executeCommand,
    tileInsideLimit,
    getPossibleTextureImprovements,
};
