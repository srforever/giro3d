import { Vector4, CanvasTexture, Texture } from 'three';

import CanvasReplayGroup from 'ol/render/canvas/ReplayGroup.js';
import {
    getSquaredTolerance as getSquaredRenderTolerance,
    renderFeature as renderVectorFeature,
} from 'ol/renderer/vector.js';
import {
    Fill, Icon, Stroke, Style, Text,
} from 'ol/style.js';
import ReplayType from 'ol/render/ReplayType.js';
import {
    create as createTransform,
    reset as resetTransform,
    scale as scaleTransform,
    translate as translateTransform,
} from 'ol/transform.js';

import Extent from '../Core/Geographic/Extent.js';

function fromOLExtent(extent, projectionCode) {
    return new Extent(projectionCode, extent[0], extent[2], extent[1], extent[3]);
}

const IMAGE_REPLAYS = {
    image: [ReplayType.POLYGON, ReplayType.CIRCLE,
        ReplayType.LINE_STRING, ReplayType.IMAGE, ReplayType.TEXT],
};

const emptyTexture = new Texture();
emptyTexture.empty = true;

const tmpTransform_ = createTransform();

function preprocessDataLayer(layer) {
    layer.imageSize = { w: 256, h: 256 };

    const format = layer.source.getFormat();
    if (format && format.dataProjection.getCode() !== layer.projection) {
        for (const f of layer.source.getFeatures()) {
            f.getGeometry().transform(
                layer.source.getFormat().dataProjection.getCode(),
                layer.projection,
            );
        }
        layer.source.on('addfeature', evt => {
            const format = layer.source.getFormat();
            if (format) {
                evt.feature.getGeometry().transform(
                    layer.source.getFormat().dataProjection.getCode(),
                    layer.projection,
                );
            }
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
    if (texture && texture.extent
        && texture.extent.isInside(extent)
        && texture.revision === layer.source.getRevision()) {
        return null;
    }

    const layerExtent = fromOLExtent(layer.source.getExtent(), layer.projection);
    if (extent.intersectsExtent(layerExtent)) {
        return extent;
    }
    if (texture && texture.empty) {
        return null;
    }
    return extent;
}

function executeCommand(command) {
    return createTexture(command.requester, command.toDownload, command.layer);
}

function createTexture(node, extent, layer) {
    const layerExtent = fromOLExtent(layer.source.getExtent(), layer.projection);
    if (!extent.intersectsExtent(layerExtent)) {
        return Promise.resolve({ texture: emptyTexture, pitch: new Vector4(0, 0, 0, 0) });
    }

    const replayGroup = createReplayGroup(extent, layer);
    let texture;
    let pitch;
    if (!replayGroup) {
        texture = new Texture();
        pitch = new Vector4(0, 0, 0, 0);
    } else {
        const _canvas = node.material.canvas;
        const atlas = node.layer.atlasInfo.atlas[layer.id];
        renderTileImage(_canvas, replayGroup, extent, atlas, layer);
        texture = new CanvasTexture(_canvas);
        pitch = new Vector4(0, 0, 1, 1);
    }
    texture.extent = extent;
    texture.revision = layer.source.getRevision();
    return Promise.resolve({ texture, pitch });
}

function createReplayGroup(extent, layer) {
    const { source } = layer;
    const pixelRatio = 1;
    const declutterTree = null;
    const resolution = (extent.dimensions().x / layer.imageSize.w);
    const renderBuffer = 100;
    const olExtent = toOLExtent(extent);
    const replayGroup = new CanvasReplayGroup(0, olExtent, resolution,
        pixelRatio, source.getOverlaps(), declutterTree, renderBuffer);
    const squaredTolerance = getSquaredRenderTolerance(resolution, pixelRatio);

    let used = false;
    const render = function render(feature) {
        let styles;
        const styleFunction = feature.getStyleFunction() || layer.getStyleFunction();
        if (styleFunction) {
            styles = styleFunction(feature, resolution);
        }
        if (styles) {
            renderFeature(feature, squaredTolerance, styles, replayGroup);
        }
        used = true;
    };
    source.forEachFeatureInExtent(olExtent, render, this);
    replayGroup.finish();

    if (used) {
        return replayGroup;
    }
    return null;
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
                handleStyleImageChange_, null,
            ) || loading;
        }
    } else {
        loading = renderVectorFeature(
            replayGroup, feature, styles, squaredTolerance,
            handleStyleImageChange_, null,
        );
    }
    return loading;
}

function handleStyleImageChange_() {
}

function renderTileImage(_canvas, replayGroup, extent, atlasInfo, layer) {
    const pixelRatio = 1;
    const replays = IMAGE_REPLAYS.image;
    const resolutionX = extent.dimensions().x / layer.imageSize.w;
    const resolutionY = extent.dimensions().y / layer.imageSize.h;
    const ctx = _canvas.getContext('2d');
    ctx.save();
    // clipping path

    ctx.translate(atlasInfo.x, atlasInfo.y);
    ctx.clearRect(0, 0, layer.imageSize.w, layer.imageSize.h + 2 * atlasInfo.offset);
    ctx.beginPath();
    ctx.rect(0, 0, layer.imageSize.w, layer.imageSize.h + 2 * atlasInfo.offset);
    ctx.clip();
    const transform = resetTransform(tmpTransform_);
    scaleTransform(transform, pixelRatio / resolutionX, -pixelRatio / resolutionY);
    translateTransform(transform, -extent.west(), -extent.north());
    replayGroup.replay(ctx, transform, 0, {}, true, replays);

    ctx.restore();
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
