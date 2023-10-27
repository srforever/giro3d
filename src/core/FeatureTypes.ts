import type Feature from 'ol/Feature';
import type { Color } from 'three';

/**
 * Object to style features in mesh form
 */
export interface FeatureStyle {
    color: Color,
    visible: boolean,
}

/**
 * This callback can be used to generate elevation for a given [ol.Feature](https://openlayers.org/en/latest/apidoc/module-ol_Feature-Feature.html) from eg its properties.
 *
 * If one number is returned, it will be used for all vertices. If an array is returned, its
 * cardinality must match the number of vertices and each value will be used for each vertex in
 * order.
 */
export type FeatureElevationCallback = ((feature: Feature) => Array<number> | number);
/**
 * This callback is called just after a source data has been converted to a THREE.js Mesh, to
 * color individual meshes from
 * [ol.Feature](https://openlayers.org/en/latest/apidoc/module-ol_Feature-Feature.html).
 *
 * @param feature the feature to style
 * @returns The style of the current feature
 */
export type FeatureStyleCallback = (feature: Feature) => FeatureStyle;

/**
 * Callback used to generate extrusion to [ol.Feature](https://openlayers.org/en/latest/apidoc/module-ol_Feature-Feature.html).
 *
 * If one number is returned, it will be used for all vertices. If an array is returned, its
 * cardinality must match the number of vertices and each value will be used for each vertex in
 * order.
 *
 */
export type FeatureExtrusionOffsetCallback = (feature: Feature) => number | number[];
