import { Texture, Vector4, CanvasTexture } from 'three';

import TileState from 'ol/TileState.js';
import { listenOnce } from 'ol/events.js';
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
    create as createTransform,
    reset as resetTransform,
    scale as scaleTransform,
    translate as translateTransform,
} from 'ol/transform.js';

import Extent from '../Core/Geographic/Extent.js';

const tmpTransform_ = createTransform();
const emptyTexture = new Texture();

function Foo() {
    this.storage = {};
    this.contains = tileCoord => tileCoord in this.storage;
}

function preprocessDataLayer(layer) {
    const { source } = layer;
    const projection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(projection);
    const sizePixel = source.getTilePixelSize(0/* z */, 1/* pixelRatio */, projection);
    // Normally we should let the map decide of the layer image size,
    // But in the case of vector tiles, it's a bit problematic.
    // Currently, vector tiles don't work well when source tiles and target tiles have
    // different extents. The solution would be to allow arbitrary number of vector tiles
    // for a single map tile (like other image tile providers do), but it's a bit more complicated
    // to do for vector tiles. See #73 for a possible fix.
    layer.imageSize = { w: sizePixel[0], h: sizePixel[1] };
    const extent = tileGrid.getExtent();
    layer.extent = fromOLExtent(extent, projection.getCode());
    layer.getStyleFunction = () => layer.style(Style, Fill, Stroke, Icon, Text);
    layer.usedTiles = {};
}

function fromOLExtent(extent, projectionCode) {
    return new Extent(projectionCode, extent[0], extent[2], extent[1], extent[3]);
}

function toOLExtent(extent) {
    return [
        Math.ceil(extent.west()),
        Math.ceil(extent.south()),
        Math.floor(extent.east()),
        Math.floor(extent.north()),
    ];
}

// eslint-disable-next-line no-unused-vars
function getPossibleTextureImprovements(layer, extent, texture, previousError) {
    const ex = extent.as(layer.extent.crs());
    const tile = selectTile(layer, ex);
    if (texture && texture.extent && texture.extent.isInside(tile.tileExtent)) {
        return null;
    }
    if (texture === emptyTexture) {
        return null;
    }
    return tile;
}

function selectTile(layer, extent) {
    const { source } = layer;
    const projection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(projection);
    const tileCoord = tileCoordForExtent(tileGrid, extent);
    if (!tileCoord) {
        return null;
    }
    const tile = source.getTile(tileCoord[0], tileCoord[1], tileCoord[2], 1, projection);

    const zKey = tile.tileCoord[0].toString();
    if (!(zKey in layer.usedTiles)) {
        layer.usedTiles[zKey] = new Foo();
    }
    layer.usedTiles[zKey].storage[tile.tileCoord] = tile;

    const tileExtent = fromOLExtent(
        tileGrid.getTileCoordExtent(tileCoord), projection.getCode(),
    );
    // OL assumes square tiles and compute maxY from minY, so recompute maxY with the correct ratio
    const dim = layer.extent.dimensions();
    const ratio = dim.y / dim.x;
    tileExtent._values[3] = tileExtent._values[2] + tileExtent.dimensions().x * ratio;
    const pitch = extent.offsetToParent(tileExtent);
    return {
        extent, pitch, tile, tileExtent,
    };
}

function tileCoordForExtent(tileGrid, extent) {
    extent = toOLExtent(extent);
    const minZoom = tileGrid.getMinZoom();
    const maxZoom = tileGrid.getMaxZoom();
    for (let z = maxZoom, tileRange; z >= minZoom; z--) {
        tileRange = tileGrid.getTileRangeForExtentAndZ(extent, z, tileRange);
        if (tileRange.getWidth() === 1 && tileRange.getHeight() === 1) {
            return [z, tileRange.minX, tileRange.minY];
        }
    }
    return null;
}

function executeCommand(command) {
    return loadTile(command.requester, command.toDownload, command.layer);
}

function loadTile(node, tile, layer) {
    let promise;
    const imageTile = tile.tile;
    if (imageTile.getState() === TileState.LOADED) {
        promise = Promise.resolve(createTexture(node, tile, layer));
    } else {
        promise = new Promise((resolve, reject) => {
            imageTile.load();
            listenOnce(imageTile, 'change', evt => {
                const imageTile2 = evt.target;
                const tileState = imageTile2.getState();
                if (tileState === TileState.ERROR) {
                    reject();
                } else if (tileState === TileState.LOADED) {
                    resolve(createTexture(node, tile, layer));
                }
            });
        });
    }
    return promise;
}

function createTexture(node, tile, layer) {
    if (!node.material) {
        return null;
    }
    const canvas = createCanvas(layer);
    const texture = new CanvasTexture(canvas);
    texture.premultiplyAlpha = layer.transparent;
    texture.extent = tile.tileExtent;

    const empty = createBuilderGroup(tile.tile, layer);

    if (empty) {
        return {
            texture,
            pitch: new Vector4(0, 0, 0, 0),
        };
    }

    renderTileImage(canvas, tile.tile, layer);

    const zKey = tile.tile.tileCoord[0].toString();
    delete layer.usedTiles[zKey].storage[tile.tile.tileCoord];
    layer.source.tileCache.expireCache(layer.usedTiles);

    return { texture, pitch: tile.pitch };
}

function createCanvas(layer) {
    const canvas = document.createElement('canvas');
    canvas.width = layer.imageSize.w;
    canvas.height = layer.imageSize.h;
    return canvas;
}

function createBuilderGroup(tile, layer) {
    const replayState = tile.getReplayState(layer);
    const { source } = layer;
    const sourceTileGrid = source.getTileGrid();
    const sourceProjection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(sourceProjection);
    const resolution = tileGrid.getResolution(tile.tileCoord[0]);
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
        const sourceTileCoord = sourceTile.tileCoord;
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

function renderTileImage(canvas, tile, layer) {
    const pixelRatio = 1;
    const replayState = tile.getReplayState(layer);
    const revision = 1;
    replayState.renderedTileRevision = revision;
    const tileCoord = tile.wrappedTileCoord;
    const z = tileCoord[0];
    const { source } = layer;
    const tileGrid = source.getTileGridForProjection(source.getProjection());
    const resolution = tileGrid.getResolution(z);
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, layer.imageSize.w, layer.imageSize.h);
    ctx.beginPath();
    ctx.rect(0, 0, layer.imageSize.w, layer.imageSize.h);
    ctx.clip();

    if (layer.backgroundColor) {
        ctx.fillStyle = layer.backgroundColor;
        ctx.fillRect(
            0, 0,
            layer.imageSize.w, layer.imageSize.h,
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
}

// eslint-disable-next-line no-unused-vars
function tileTextureCount(tile, layer) {
    return 1;
}

function tileInsideLimit(tile, layer) {
    const extent = tile.getExtentForLayer(layer).as(layer.extent.crs());
    return extent.isInside(layer.extent);
}

export default {
    preprocessDataLayer,
    executeCommand,
    tileTextureCount,
    tileInsideLimit,
    getPossibleTextureImprovements,
};
