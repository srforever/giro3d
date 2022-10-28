import { Vector4, CanvasTexture, Texture } from 'three';

// Even if it's not explicited in the changelog
// https://github.com/openlayers/openlayers/blob/main/changelog/upgrade-notes.md
// Around OL6 the replay group mechanism was split into BuilderGroup to create the
// instructions and ExecutorGroup to run them.
// The mechanism was altered following
// https://github.com/openlayers/openlayers/issues/9215
// to make it work

import CanvasBuilderGroup from 'ol/render/canvas/BuilderGroup.js';
import ExecutorGroup from 'ol/render/canvas/ExecutorGroup.js';
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

function fromOLExtent(extent, projectionCode) {
    return new Extent(projectionCode, extent[0], extent[2], extent[1], extent[3]);
}

const emptyTexture = new Texture();
emptyTexture.empty = true;

const tmpTransform_ = createTransform();

function preprocessDataLayer(layer) {
    const format = layer.source.getFormat();
    if (format && format.dataProjection.getCode() !== layer.projection) {
        for (const f of layer.source.getFeatures()) {
            f.getGeometry().transform(
                layer.source.getFormat().dataProjection.getCode(),
                layer.projection,
            );
        }
        layer.source.on('addfeature', evt => {
            const frmt = layer.source.getFormat();
            if (frmt) {
                evt.feature.getGeometry().transform(
                    frmt.dataProjection.getCode(),
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
function getPossibleTextureImprovements(layer, extent, texture, previousError) {
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

    const builderGroup = createBuilderGroup(extent, layer);
    let texture;
    let pitch;
    if (!builderGroup) {
        texture = new Texture();
        pitch = new Vector4(0, 0, 0, 0);
    } else {
        const canvas = createCanvas(layer);
        renderTileImage(canvas, builderGroup, extent, layer);
        texture = new CanvasTexture(canvas);
        pitch = new Vector4(0, 0, 1, 1);
    }
    texture.extent = extent;
    texture.revision = layer.source.getRevision();
    return Promise.resolve({ texture, pitch });
}

function createCanvas(layer) {
    const canvas = document.createElement('canvas');
    canvas.width = layer.imageSize.w;
    canvas.height = layer.imageSize.h;
    return canvas;
}

function createBuilderGroup(extent, layer) {
    const { source } = layer;
    const pixelRatio = 1;
    const resolution = (extent.dimensions().x / layer.imageSize.w);
    const olExtent = toOLExtent(extent);
    const builderGroup = new CanvasBuilderGroup(0, olExtent, resolution, pixelRatio);
    const squaredTolerance = getSquaredRenderTolerance(resolution, pixelRatio);

    let used = false;
    const render = function render(feature) {
        let styles;
        const styleFunction = feature.getStyleFunction() || layer.getStyleFunction();
        if (styleFunction) {
            styles = styleFunction(feature, resolution);
        }
        if (styles) {
            renderFeature(feature, squaredTolerance, styles, builderGroup);
        }
        used = true;
    };
    source.forEachFeatureInExtent(olExtent, render, this);

    if (used) {
        return builderGroup;
    }
    return null;
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
                handleStyleImageChange_,
            ) || loading;
        }
    } else {
        loading = renderVectorFeature(
            builderGroup, feature, styles, squaredTolerance,
            handleStyleImageChange_,
        );
    }
    return loading;
}

function handleStyleImageChange_() {
}

function renderTileImage(canvas, builderGroup, extent, layer) {
    const pixelRatio = 1;
    const resolutionX = extent.dimensions().x / layer.imageSize.w;
    const resolutionY = extent.dimensions().y / layer.imageSize.h;
    const ctx = canvas.getContext('2d');
    ctx.save();
    // clipping path

    ctx.clearRect(0, 0, layer.imageSize.w, layer.imageSize.h);
    ctx.beginPath();
    ctx.rect(0, 0, layer.imageSize.w, layer.imageSize.h);
    ctx.clip();
    const transform = resetTransform(tmpTransform_);
    scaleTransform(transform, pixelRatio / resolutionX, -pixelRatio / resolutionY);
    translateTransform(transform, -extent.west(), -extent.north());
    const olExtent = toOLExtent(extent);
    const resolution = (extent.dimensions().x / layer.imageSize.w);
    const executor = new ExecutorGroup(
        olExtent, resolution, pixelRatio, true, builderGroup.finish(),
    );
    executor.execute(ctx, 1, transform, 0, true);

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
    getPossibleTextureImprovements,
};
