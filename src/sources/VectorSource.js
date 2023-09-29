/**
 * @module sources/VectorSource
 */

import { CanvasTexture, Vector2 } from 'three';
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
    Style,
} from 'ol/style.js';
import {
    create as createTransform,
    reset as resetTransform,
    scale as scaleTransform,
    translate as translateTransform,
} from 'ol/transform.js';
import Feature from 'ol/Feature.js';
import Vector from 'ol/source/Vector.js';
import FeatureFormat from 'ol/format/Feature.js';
import ImageSource, { ImageResult } from './ImageSource.js';
import OpenLayersUtils from '../utils/OpenLayersUtils.js';
import Extent from '../core/geographic/Extent';
import Fetcher from '../utils/Fetcher.js';

const tmpExtent = new Array(4);

const tmpTransform_ = createTransform();

function createCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    return canvas;
}

/**
 * Renders a single feature into the builder group.
 *
 * @param {Feature} feature The feature to render.
 * @param {number} squaredTolerance Squared tolerance for geometry simplification.
 * @param {Style|Style[]} styles The style(s) of the feature.
 * @param {CanvasBuilderGroup} builderGroup The builder group.
 * @param {Function} onStyleChanged A callback when the styles has changed
 * (such as an image being loaded).
 */
function renderFeature(feature, squaredTolerance, styles, builderGroup, onStyleChanged) {
    if (!styles) {
        return;
    }

    function doRender(style) {
        renderVectorFeature(
            builderGroup, feature, style, squaredTolerance,
            onStyleChanged,
        );
    }

    if (Array.isArray(styles)) {
        for (let i = 0, ii = styles.length; i < ii; ++i) {
            doRender(styles[i]);
        }
    } else {
        doRender(styles);
    }
}

/**
 * Rasterizes the builder group into the canvas.
 *
 * @param {HTMLCanvasElement} canvas The target canvas.
 * @param {CanvasBuilderGroup} builderGroup The builder group.
 * @param {Extent} extent The canvas extent.
 * @param {Vector2} size The canvas size, in pixels.
 */
function rasterizeBuilderGroup(canvas, builderGroup, extent, size) {
    const pixelRatio = 1;
    const resX = extent.dimensions().x / size.width;
    const resY = extent.dimensions().y / size.height;
    const ctx = canvas.getContext('2d');

    const transform = resetTransform(tmpTransform_);
    scaleTransform(transform, pixelRatio / resX, -pixelRatio / resY);
    translateTransform(transform, -extent.west(), -extent.north());

    const olExtent = OpenLayersUtils.toOLExtent(extent);
    const resolution = (extent.dimensions().x / size.width);

    const executor = new ExecutorGroup(
        olExtent,
        resolution,
        pixelRatio,
        true,
        builderGroup.finish(),
    );

    executor.execute(ctx, 1, transform, 0, true);
}

/**
 * @typedef {Function} StyleFunction
 * @param {Feature} feature - The feature to style.
 * @returns {Style} The OpenLayers [Style](https://openlayers.org/en/latest/apidoc/module-ol_style_Style-Style.html).
 */

/**
 * An image source that reads vector data. Internally, this wraps an OpenLayers' [VectorSource](https://openlayers.org/en/latest/apidoc/module-ol_source_Vector-VectorSource.html).
 * This uses OpenLayers' styles and features.
 *
 * Note: to assign a new style to the source, use {@link setStyle} instead of
 * the {@link style} property.
 *
 * @example
 * // To load a remote GeoJSON file
 * const source = new VectorSource({
 *      data: 'http://example.com/data.geojson',
 *      format: new GeoJSON(), // Pass the OpenLayers FeatureFormat here
 *      style: new Style(...), // Pass an OpenLayers style here
 * });
 *
 * // To load a local GeoJSON
 * const source = new VectorSource({
 *      data: { "type": "FeatureCollection" ... },
 *      format: new GeoJSON(), // Pass the OpenLayers FeatureFormat here
 *      style: new Style(...), // Pass an OpenLayers style here
 * });
 *
 * // To load features directly (no need to pass a format as the features are already decoded.)
 * const source = new VectorSource({
 *      data: [new Feature(...)], // Pass the OpenLayers features here
 *      style: new Style(...), // Pass an OpenLayers style here
 * });
 */
class VectorSource extends ImageSource {
    /**
     * @param {object} options Options.
     * @param {string} [options.dataProjection] The projection of the data source. Must be specified
     * if the source does not have the same projection as the Giro3D instance.
     * @param {FeatureFormat} [options.format] The data format. Required if `url` or `data` are
     * used. Must be an OpenLayers [FeatureFormat](https://openlayers.org/en/latest/apidoc/module-ol_format_Feature-FeatureFormat.html).
     * @param {string|Feature[]} options.data The data content. Can be:
     *  - A URL to a remote file (requires the `format` parameter)
     *  - The content of the source (such as GeoJSON) (requires the `format` parameter)
     *  - A list of OpenLayers features.
     * @param {Style|StyleFunction} options.style The style, or style function. The style must be an
     * OpenLayers [Style](https://openlayers.org/en/latest/apidoc/module-ol_style_Style-Style.html).
     * @param {import('./ImageSource.js').CustomContainsFn} [options.containsFn] The custom function
     * to test if a given extent is contained in this source.
     */
    constructor(options) {
        super(options);
        if (options.data == null) {
            throw new Error('"data" parameter is required');
        }
        if (!options.format && typeof options.data == 'string') {
            throw new Error('format required if features are not passed directly.');
        }

        this.isVectorSource = true;
        this.type = 'VectorSource';

        this.data = options.data;
        this.format = options.format;

        this.source = new Vector();

        /** @type {string} */
        this.dataProjection = options.dataProjection;
        /**
         * The current style.
         * Note: to set a new style, use `setStyle()` instead.
         *
         * @type {Style|function(Feature):Style}
         */
        this.style = options.style;
    }

    /**
     * Change the style of this source. This triggers an update of the source.
     *
     * @param {Style|function(Feature):Style} style The style, or style function.
     */
    setStyle(style) {
        this.style = style;
        this.update();
    }

    /**
     * Loads the features from this source, either from:
     * - the URL
     * - the data string (for example a GeoJSON string)
     * - the features array
     */
    async loadFeatures() {
        let features;
        if (Array.isArray(this.data)) {
            features = this.data;
        } else {
            let content;
            try {
                // Download the data file.
                const url = new URL(this.data);
                content = await Fetcher.text(url.toString());
            } catch (e) {
                if (e instanceof TypeError) {
                    // Not a URL, let's parse it instead.
                    content = this.data;
                } else {
                    throw e;
                }
            }

            features = this.format.readFeatures(content);
        }

        this.source.addFeatures(features);
    }

    /**
     * Reprojects a feature from the source projection into the target (instance) projection.
     *
     * @param {Feature} feature The feature to reproject.
     */
    reproject(feature) {
        feature.getGeometry().transform(
            this.dataProjection,
            this.targetProjection,
        );
    }

    async initialize({ targetProjection }) {
        await this.loadFeatures();

        this.targetProjection = targetProjection;
        const shouldReproject = this.dataProjection
            && this.dataProjection !== this.targetProjection;

        if (shouldReproject) {
            for (const feature of this.source.getFeatures()) {
                this.reproject(feature);
            }
        }

        this.source.on('change', () => {
            this.update();
        });

        this.source.on('addfeature', evt => {
            this.update();

            if (shouldReproject) {
                this.reproject(evt.feature);
            }
        });
    }

    /**
     * Returns an array with the feature in this source.
     *
     * @returns {Feature[]} The features.
     */
    getFeatures() {
        return this.source.getFeatures();
    }

    /**
     * Returns the feature with the specified id.
     *
     * @param {string|number} id The feature id.
     * @returns {Feature} The feature.
     */
    getFeatureById(id) {
        return this.source.getFeatureById(id);
    }

    /**
     * Applies the callback for each feature in this source.
     *
     * @param {function(Feature): void} callback The callback.
     */
    forEachFeature(callback) {
        this.source.forEachFeature(callback);
    }

    getCrs() {
        // Note that since we are reprojecting vector _inside_ the source,
        // the source projection is the same as the target projection, indicating
        // that no projection needs to be done on images produced by this source.
        return this.targetProjection;
    }

    getExtent() {
        return this.getCurrentExtent();
    }

    getCurrentExtent() {
        const sourceExtent = this.source.getExtent(tmpExtent);
        if (!Number.isFinite(sourceExtent[0])) {
            return null;
        }
        return OpenLayersUtils.fromOLExtent(sourceExtent, this.targetProjection);
    }

    /**
     * @param {Extent} extent The target extent.
     * @param {Vector2} size The target pixel size.
     * @returns {CanvasBuilderGroup|null} The builder group, or null if no features have been
     * rendered.
     */
    createBuilderGroup(extent, size) {
        const pixelRatio = 1;

        // We collect features in a larger extent than the target, because the feature extent
        // does not take into account the thickness of lines or the size of icons.
        // Thus, icons and lines may appear cropped because they were geographically
        // outside the target extent, but visually within.
        const testExtent = extent.withRelativeMargin(1);

        const resolution = (extent.dimensions().x / size.width);
        const olExtent = OpenLayersUtils.toOLExtent(testExtent, 0.001);
        const builderGroup = new CanvasBuilderGroup(0, olExtent, resolution, pixelRatio);
        const squaredTolerance = getSquaredRenderTolerance(resolution, pixelRatio);

        const defaultStyle = this.style;

        let used = false;
        const onStyleChanged = () => this.update();
        const render = function render(feature) {
            let styles;
            const style = feature.getStyleFunction() || defaultStyle;
            if (typeof style === 'function') {
                styles = style(feature, resolution);
            } else {
                styles = defaultStyle;
            }
            if (styles) {
                renderFeature(feature, squaredTolerance, styles, builderGroup, onStyleChanged);
            }
            used = true;
        };

        this.source.forEachFeatureInExtent(olExtent, render, this);

        if (used) {
            return builderGroup;
        }
        return null;
    }

    /**
     * @param {string} id The unique id of the request.
     * @param {Extent} extent The request extent.
     * @param {Vector2} size The size in pixels of the request.
     * @returns {ImageResult} The image result.
     */
    createImage(id, extent, size) {
        const builderGroup = this.createBuilderGroup(extent, size);
        let texture;
        if (!builderGroup) {
            texture = null;
        } else {
            const canvas = createCanvas(size);
            rasterizeBuilderGroup(canvas, builderGroup, extent, size);
            texture = new CanvasTexture(canvas);
        }

        return new ImageResult({ id, texture, extent });
    }

    intersects(extent) {
        // It's a bit an issue with vector sources, as they are dynamic : when the user adds
        // a feature, the extent changes. Thus we cannot cache the extent.
        const sourceExtent = this.getCurrentExtent();
        // The extent may be null if no features are present in the source.
        if (sourceExtent) {
            // We need to test against a larger extent because features may be geographically
            // outside the extent, but visual representation may be inside (due to styles not
            // being taken into account when computing the extent of a feature).
            const safetyExtent = extent.withRelativeMargin(1);
            return sourceExtent.intersectsExtent(safetyExtent);
        }

        return false;
    }

    /**
     * Gets the images for the specified extent and pixel size.
     *
     * @param {object} options The options.
     * @param {Extent} options.extent The extent of the request area.
     * @param {number} options.width The pixel width of the request area.
     * @param {number} options.height The pixel height of the request area.
     * @param {AbortSignal} [options.signal] The optional abort signal.key
     * @returns {Array<{ id: string, request: function(()):Promise<ImageResult>}>} An array
     * containing the functions to generate the images asynchronously.
     */
    getImages(options) {
        const {
            extent, width, height, id,
        } = options;

        const request = () => Promise.resolve(this.createImage(id, extent, { width, height }));

        return [{ id, request }];
    }
}

export default VectorSource;
