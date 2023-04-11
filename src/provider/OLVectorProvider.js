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

import DataStatus from './DataStatus.js';
import OpenLayersUtils from '../utils/OpenLayersUtils.js';

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

function getPossibleTextureImprovements({
    layer,
    extent,
    texture,
    size,
}) {
    if (texture && texture.extent
        && texture.extent.isInside(extent)
        && texture.revision === layer.source.getRevision()) {
        return DataStatus.DATA_ALREADY_LOADED;
    }

    const layerExtent = OpenLayersUtils.fromOLExtent(layer.source.getExtent(), layer.projection);
    if (extent.intersectsExtent(layerExtent)) {
        return { extent, size };
    }
    if (texture && texture.empty) {
        return DataStatus.DATA_NOT_AVAILABLE_YET;
    }
    return { extent, size };
}

function executeCommand(instance, layer, requester, toDownload) {
    const { extent, pitch, size } = toDownload;
    return createTexture(extent, pitch, layer, size);
}

function createTexture(extent, pitch, layer, size) {
    const layerExtent = OpenLayersUtils.fromOLExtent(layer.source.getExtent(), layer.projection);
    if (!extent.intersectsExtent(layerExtent)) {
        return Promise.resolve({ texture: emptyTexture, pitch: new Vector4(0, 0, 0, 0) });
    }

    const builderGroup = createBuilderGroup(extent, layer, size);
    let texture;
    if (!builderGroup) {
        texture = new Texture();
        pitch = new Vector4(0, 0, 0, 0);
    } else {
        const canvas = createCanvas(size);
        renderTileImage(canvas, builderGroup, extent, size);
        texture = new CanvasTexture(canvas);
        pitch = pitch ?? new Vector4(0, 0, 1, 1);
    }
    texture.extent = extent;
    texture.revision = layer.source.getRevision();
    return Promise.resolve({ texture, pitch });
}

function createCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    return canvas;
}

function createBuilderGroup(extent, layer, size) {
    const { source } = layer;
    const pixelRatio = 1;
    const resolution = (extent.dimensions().x / size.width);
    const olExtent = OpenLayersUtils.toOLExtent(extent, 0.001);
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

function renderTileImage(canvas, builderGroup, extent, size) {
    const pixelRatio = 1;
    const resolutionX = extent.dimensions().x / size.width;
    const resolutionY = extent.dimensions().y / size.height;
    const ctx = canvas.getContext('2d');
    ctx.save();
    // clipping path

    ctx.clearRect(0, 0, size.width, size.height);
    ctx.beginPath();
    ctx.rect(0, 0, size.width, size.height);
    ctx.clip();
    const transform = resetTransform(tmpTransform_);
    scaleTransform(transform, pixelRatio / resolutionX, -pixelRatio / resolutionY);
    translateTransform(transform, -extent.west(), -extent.north());
    const olExtent = OpenLayersUtils.toOLExtent(extent);
    const resolution = (extent.dimensions().x / size.width);
    const executor = new ExecutorGroup(
        olExtent, resolution, pixelRatio, true, builderGroup.finish(),
    );
    executor.execute(ctx, 1, transform, 0, true);

    ctx.restore();
}

function tileInsideLimit() {
    // always return true: new features may be added later
    return true;
}

export default {
    preprocessDataLayer,
    executeCommand,
    tileInsideLimit,
    getPossibleTextureImprovements,
};
