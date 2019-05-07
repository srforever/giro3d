import { Texture, Vector4, CanvasTexture } from 'three';

import TileState from 'ol/TileState';
import { listenOnce } from 'ol/events';
import { createEmpty as createEmptyExtent,
         getIntersection, equals, buffer, intersects } from 'ol/extent';
import CanvasReplayGroup from 'ol/render/canvas/ReplayGroup';
import { getSquaredTolerance as getSquaredRenderTolerance,
         renderFeature as renderVectorFeature,
       } from 'ol/renderer/vector';
import { Fill, Icon, Stroke, Style, Text } from 'ol/style';
import ReplayType from 'ol/render/ReplayType';
import {
  create as createTransform,
  reset as resetTransform,
  scale as scaleTransform,
  translate as translateTransform,
} from 'ol/transform';
import { equivalent as equivalentProjection } from 'ol/proj';
import Units from 'ol/proj/Units';

import Extent from '../Core/Geographic/Extent';

const IMAGE_REPLAYS = {
    image: [ReplayType.POLYGON, ReplayType.CIRCLE,
        ReplayType.LINE_STRING, ReplayType.IMAGE, ReplayType.TEXT],
};

const tmpTransform_ = createTransform();
const emptyTexture = new Texture();
const emptyPitch = new Vector4(0, 0, 1, 1);

function Foo() {
    this.storage = {};
    this.contains = tileCoord => tileCoord in this.storage;
}

function preprocessDataLayer(layer) {
    const source = layer.source;
    const projection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(projection);
    const sizePixel = source.getTilePixelSize(0 /* z */, 1 /* pixelRatio */, source.getProjection());
    layer.imageSize = { w: sizePixel[0], h: sizePixel[1] };
    const extent = tileGrid.getExtent();
    layer.extent = fromOLExtent(extent, projection.getCode());
    layer.getStyleFunction = () => layer.style(Style, Fill, Stroke, Icon, Text);
    layer.fx = 0.0;
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
function canTextureBeImproved(layer, extent, texture, previousError) {
    const ex = extent.as(layer.extent.crs());
    const tile = selectTile(layer, ex);
    if (texture && texture.extent && texture.extent.isInside(tile.tileExtent)) {
        return;
    }
    if (texture == emptyTexture) {
        return;
    }
    return tile;
}

function selectTile(layer, extent) {
    const source = layer.source;
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
        tileGrid.getTileCoordExtent(tileCoord), projection.getCode());
    // OL assumes square tiles and compute maxY from minY, so recompute maxY with the correct ratio
    const dim = layer.extent.dimensions();
    const ratio = dim.y / dim.x;
    tileExtent._values[3] = tileExtent._values[2] + tileExtent.dimensions().x * ratio;
    const pitch = extent.offsetToParent(tileExtent);
    return { extent, pitch, tile, tileExtent };
}

function tileCoordForExtent(tileGrid, extent) {
    extent = toOLExtent(extent);
    const minZoom = tileGrid.getMinZoom();
    const maxZoom = tileGrid.getMaxZoom();
    for (let z = maxZoom, tileRange; z >= minZoom; z--) {
        tileRange = tileGrid.getTileRangeForExtentAndZ(extent, z, tileRange);
        if (tileRange.getWidth() == 1 && tileRange.getHeight() == 1) {
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
    if (imageTile.getState() == TileState.LOADED) {
        promise = Promise.resolve(createTexture(node, tile, layer));
    } else {
        promise = new Promise((resolve, reject) => {
            imageTile.load();
            listenOnce(imageTile, 'change', evt => {
                const imageTile = evt.target;
                const tileState = imageTile.getState();
                if (tileState == TileState.ERROR) {
                    reject();
                } else if (tileState == TileState.LOADED) {
                    resolve(createTexture(node, tile, layer));
                }
            });
        });
    }
    return promise;
}

function createTexture(node, tile, layer) {
    if (!node.material) {
        return;
    }
    const _canvas = node.material.canvas;
    const texture = new CanvasTexture(_canvas);
    // texture.needsUpdate = true;
    texture.premultiplyAlpha = layer.transparent;
    texture.extent = tile.tileExtent;

    const empty = createReplayGroup(tile.tile, layer);

    if (empty) {
        return {
            texture,
            pitch: new Vector4(0, 0, 0, 0),
        };
    }

    const atlas = node.layer.atlasInfo.atlas[layer.id];
    renderTileImage(_canvas, tile.tile, atlas, layer);

    for (let t = 0, tt = tile.tile.tileKeys.length; t < tt; ++t) {
        const sourceTile = tile.tile.getTile(tile.tile.tileKeys[t]);
        if (sourceTile.getState() != TileState.LOADED) {
            continue;
        }
        sourceTile.setReplayGroup(layer, tile.tile.tileCoord.toString(), undefined);
    }

    const zKey = tile.tile.tileCoord[0].toString();
    delete layer.usedTiles[zKey].storage[tile.tile.tileCoord];
    layer.source.tileCache.expireCache(layer.usedTiles);

    return { texture, pitch: tile.pitch };
}

function createReplayGroup(tile, layer) {
    const replayState = tile.getReplayState(layer);
    const source = layer.source;
    const sourceTileGrid = source.getTileGrid();
    const sourceProjection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(sourceProjection);
    const resolution = tileGrid.getResolution(tile.tileCoord[0]);
    const tileExtent = tile.extent;
    const renderOrder = null;

    const tmpExtent = createEmptyExtent();
    if (tile.tileKeys.length > 1) {
        console.log(tile.tileKeys.length);
    }
    let empty = true;
    for (let t = 0, tt = tile.tileKeys.length; t < tt; ++t) {
        const sourceTile = tile.getTile(tile.tileKeys[t]);
        if (sourceTile.getState() != TileState.LOADED) {
            console.log('not loaded !!!');
            continue;
        }
        const sourceTileCoord = sourceTile.tileCoord;
        const sourceTileExtent = sourceTileGrid.getTileCoordExtent(sourceTileCoord);
        const sharedExtent = getIntersection(tileExtent, sourceTileExtent);
        const renderBuffer = 100;
        const bufferedExtent = equals(sourceTileExtent, sharedExtent) ? null :
          buffer(sharedExtent, renderBuffer * resolution, tmpExtent);
        const tileProjection = sourceTile.getProjection();
        let reproject = false;
        if (!equivalentProjection(sourceProjection, tileProjection)) {
            reproject = true;
            sourceTile.setProjection(sourceProjection);
        }
        replayState.dirty = false;
        const pixelRatio = 1;
        const declutterTree = null;
        const replayGroup = new CanvasReplayGroup(0, sharedExtent, resolution,
          pixelRatio, source.getOverlaps(), declutterTree, renderBuffer);
        const squaredTolerance = getSquaredRenderTolerance(resolution, pixelRatio);

        const render = function render(feature) {
            let styles;
            const styleFunction = feature.getStyleFunction() || layer.getStyleFunction();
            if (styleFunction) {
                styles = styleFunction(feature, resolution);
            }
            if (styles) {
                const dirty = renderFeature(feature, squaredTolerance, styles, replayGroup);
                // this.dirty_ = this.dirty_ || dirty;
                replayState.dirty = replayState.dirty || dirty;
            }
        };

        const features = sourceTile.getFeatures();
        if (renderOrder && renderOrder !== replayState.renderedRenderOrder) {
            features.sort(renderOrder);
        }
        for (let i = 0, ii = features.length; i < ii; ++i) {
            const feature = features[i];
            if (reproject) {
                if (tileProjection.getUnits() == Units.TILE_PIXELS) {
                    // projected tile extent
                    tileProjection.setWorldExtent(sourceTileExtent);
                    // tile extent in tile pixel space
                    tileProjection.setExtent(sourceTile.getExtent());
                }
                feature.getGeometry().transform(tileProjection, sourceProjection);
            }
            if (!bufferedExtent || intersects(bufferedExtent, feature.getGeometry().getExtent())) {
                render.call(this, feature);
            }
            empty = false;
        }
        replayGroup.finish();
        if (!empty) {
            sourceTile.setReplayGroup(layer, tile.tileCoord.toString(), replayGroup);
        }
    }
    replayState.renderedRevision = 1;
    replayState.renderedRenderOrder = renderOrder;
    return empty;
}

function renderFeature(feature, squaredTolerance, styles, replayGroup) {
    if (!styles) {
        return false;
    }
    let loading = false;
    if (Array.isArray(styles)) {
        for (let i = 0, ii = styles.length; i < ii; ++i) {
            loading = renderVectorFeature(
                replayGroup, feature, styles[i], squaredTolerance,
                handleStyleImageChange_, null) || loading;
        }
    } else {
        loading = renderVectorFeature(
          replayGroup, feature, styles, squaredTolerance,
          handleStyleImageChange_, null);
    }
    return loading;
}

function handleStyleImageChange_() {
}

function renderTileImage(_canvas, tile, atlasInfo, layer) {
    const pixelRatio = 1;
    const replayState = tile.getReplayState(layer);
    const revision = 1;
    const replays = IMAGE_REPLAYS.image;
    replayState.renderedTileRevision = revision;
    const tileCoord = tile.wrappedTileCoord;
    const z = tileCoord[0];
    const source = layer.source;
    const tileGrid = source.getTileGridForProjection(source.getProjection());
    const resolution = tileGrid.getResolution(z);
    const ctx = _canvas.getContext('2d');
    ctx.save();
    ctx.translate(atlasInfo.x, atlasInfo.y);
    ctx.clearRect(0, 0, layer.imageSize.w, layer.imageSize.h + 2 * atlasInfo.offset);
    ctx.beginPath();
    ctx.rect(0, 0, layer.imageSize.w, layer.imageSize.h + 2 * atlasInfo.offset);
    ctx.clip();

    //  tile.getContext(layer);
    const size = source.getTilePixelSize(z, pixelRatio, source.getProjection());
    // context.canvas.width = size[0];
    // context.canvas.height = size[1];
    if (layer.backgroundColor) {
        ctx.fillStyle = layer.backgroundColor;
        ctx.fillRect(
            0, 0,
            layer.imageSize.w, layer.imageSize.h + 2 * atlasInfo.offset);
    }
    const tileExtent = tileGrid.getTileCoordExtent(tileCoord);
    let empty = true;
    for (let i = 0, ii = tile.tileKeys.length; i < ii; ++i) {
        const sourceTile = tile.getTile(tile.tileKeys[i]);
        if (sourceTile.getState() != TileState.LOADED) {
            continue;
        }
        const pixelScale = pixelRatio / resolution;
        const transform = resetTransform(tmpTransform_);
        scaleTransform(transform, pixelScale, -pixelScale);
        translateTransform(transform, -tileExtent[0], -tileExtent[3]);
        const replayGroup = /** @type {CanvasReplayGroup} */ (sourceTile.getReplayGroup(layer,
          tile.tileCoord.toString()));
        if (replayGroup) {
            replayGroup.replay(ctx, transform, 0, {}, true, replays);
            empty = false;
        }
    }
    ctx.restore();
    return empty;
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
    canTextureBeImproved,
};
