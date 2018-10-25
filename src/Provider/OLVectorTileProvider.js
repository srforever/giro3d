import { Texture } from 'three/src/textures/Texture';

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

function preprocessDataLayer(layer) {
    const source = layer.source;
    const projection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(projection);
    const extent = tileGrid.getExtent();
    layer.extent = fromOLExtent(extent, projection.getCode());
    layer.getStyleFunction = () => layer.style(Style, Fill, Stroke, Icon, Text);
    layer.fx = 0.0;
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
    return [tile];
}

function selectTile(layer, extent) {
    const source = layer.source;
    const projection = source.getProjection();
    const tileGrid = source.getTileGridForProjection(projection);
    const tileCoord = tileCoordForExtent(tileGrid, extent);
    const tile = source.getTile(tileCoord[0], tileCoord[1], tileCoord[2], 1, projection);
    const tileExtent = fromOLExtent(
        tileGrid.getTileCoordExtent(tileCoord), projection.getCode());
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
    const promises = [];
    for (const tile of command.toDownload) {
        promises.push(loadTile(tile, command.layer));
    }
    return Promise.all(promises);
}

function loadTile(tile, layer) {
    let promise;
    const imageTile = tile.tile;
    if (imageTile.getState() == TileState.LOADED) {
        promise = Promise.resolve(createTexture(tile, layer));
    } else {
        promise = new Promise((resolve, reject) => {
            imageTile.load();
            listenOnce(imageTile, 'change', (evt) => {
                const imageTile = evt.target;
                const tileState = imageTile.getState();
                if (tileState == TileState.ERROR) {
                    reject();
                } else if (tileState == TileState.LOADED) {
                    resolve(createTexture(tile, layer));
                }
            });
        });
    }
    return promise;
}

function createTexture(tile, layer) {
    createReplayGroup(tile.tile, layer);
    renderTileImage(tile.tile, layer);
    const image = tile.tile.getImage(layer);
    const texture = new Texture(image);
    texture.needsUpdate = true;
    texture.premultiplyAlpha = layer.transparent;
    texture.extent = tile.tileExtent;
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
    for (let t = 0, tt = tile.tileKeys.length; t < tt; ++t) {
        const sourceTile = tile.getTile(tile.tileKeys[t]);
        if (sourceTile.getState() != TileState.LOADED) {
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
        }
        replayGroup.finish();
        sourceTile.setReplayGroup(layer, tile.tileCoord.toString(), replayGroup);
    }
    replayState.renderedRevision = 1;
    replayState.renderedRenderOrder = renderOrder;
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

function renderTileImage(tile, layer) {
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
    const context = tile.getContext(layer);
    const size = source.getTilePixelSize(z, pixelRatio, source.getProjection());
    context.canvas.width = size[0];
    context.canvas.height = size[1];
    const tileExtent = tileGrid.getTileCoordExtent(tileCoord);
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
        replayGroup.replay(context, transform, 0, {}, true, replays);
    }
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
