import { Vector4, CanvasTexture } from 'three';

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

import Extent from '../Core/Geographic/Extent';

function fromOLExtent(extent, projectionCode) {
    return new Extent(projectionCode, extent[0], extent[2], extent[1], extent[3]);
}

const IMAGE_REPLAYS = {
    image: [ReplayType.POLYGON, ReplayType.CIRCLE,
        ReplayType.LINE_STRING, ReplayType.IMAGE, ReplayType.TEXT],
};

const tmpTransform_ = createTransform();

function preprocessDataLayer(layer) {
    if (layer.source.getFormat().dataProjection.getCode() != layer.projection) {
        for (const f of layer.source.getFeatures()) {
            f.getGeometry().transform(
                layer.source.getFormat().dataProjection.getCode(),
                layer.projection);
        }
        layer.source.on('addfeature', (evt) => {
            evt.feature.getGeometry().transform(
                layer.source.getFormat().dataProjection.getCode(),
                layer.projection);
        });
    }

    layer.getStyleFunction = () => layer.style(Style, Fill, Stroke, Icon, Text);
}

function toOLExtent(extent) {
    return [
        Math.floor(extent.west()),
        Math.floor(extent.south()),
        Math.ceil(extent.east()),
        Math.ceil(extent.north()),
    ];
}

// eslint-disable-next-line no-unused-vars
function canTextureBeImproved(layer, extent, texture, previousError) {
    if (texture && texture.extent &&
        texture.extent.isInside(extent) &&
        texture.revision == layer.source.getRevision()) {
        return null;
    }

    const layerExtent = fromOLExtent(layer.source.getExtent(), layer.projection);
    if (extent.intersectsExtent(layerExtent)) {
        return extent;
    }
    return null;
}

function executeCommand(command) {
    return createTexture(command.toDownload, command.layer);
}

function createTexture(extent, layer) {
    const replayGroup = createReplayGroup(extent, layer);
    const _canvas = document.createElement('canvas');
    renderTileImage(_canvas, replayGroup, extent);
    const texture = new CanvasTexture(_canvas);
    texture.premultiplyAlpha = layer.transparent;
    texture.extent = extent;
    texture.revision = layer.source.getRevision();
    return Promise.resolve({ texture, pitch: new Vector4(0, 0, 1, 1) });
}

function createReplayGroup(extent, layer) {
    const source = layer.source;
    const pixelRatio = 1;
    const declutterTree = null;
    const resolution = (extent.dimensions().x / 256);
    const renderBuffer = 100;
    const olExtent = toOLExtent(extent);
    const replayGroup = new CanvasReplayGroup(0, olExtent, resolution,
      pixelRatio, source.getOverlaps(), declutterTree, renderBuffer);
    const squaredTolerance = getSquaredRenderTolerance(resolution, pixelRatio);

    const render = function render(feature) {
        let styles;
        const styleFunction = feature.getStyleFunction() || layer.getStyleFunction();
        if (styleFunction) {
            styles = styleFunction(feature, resolution);
        }
        if (styles) {
            renderFeature(feature, squaredTolerance, styles, replayGroup);
        }
    };

    source.forEachFeatureInExtent(olExtent, render, this);

    replayGroup.finish();
    return replayGroup;
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

function renderTileImage(_canvas, replayGroup, extent) {
    const pixelRatio = 1;
    const replays = IMAGE_REPLAYS.image;
    const resolutionX = extent.dimensions().x / 256;
    const resolutionY = extent.dimensions().y / 256;
    _canvas.width = 256;
    _canvas.height = 256;
    const context = _canvas.getContext('2d');
    const transform = resetTransform(tmpTransform_);
    scaleTransform(transform, pixelRatio / resolutionX, -pixelRatio / resolutionY);
    translateTransform(transform, -extent.west(), -extent.north());
    replayGroup.replay(context, transform, 0, {}, true, replays);
}

// eslint-disable-next-line no-unused-vars
function tileTextureCount(tile, layer) {
    return 1;
}

function tileInsideLimit() {
    // always return true: new features may be added later
    return true;
}

export default {
    preprocessDataLayer,
    executeCommand,
    tileTextureCount,
    tileInsideLimit,
    canTextureBeImproved,
};
