import GeoJSON from 'ol/format/GeoJSON.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import VectorSource from '@giro3d/giro3d/sources/VectorSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

import StatusBar from './widgets/StatusBar.js';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    -20037508.342789244,
    20037508.342789244,
    -20037508.342789244,
    20037508.342789244,
);

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a Giro3D instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0xffffff,
    },
});

// Instanciates camera
instance.camera.camera3D.position.set(0, 0, 10000000);

// Instanciates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;

instance.useTHREEControls(controls);

// Adds layers in a map

const map = new Map('planar', { extent, maxSubdivisionLevel: 15 });
instance.add(map);

const ecoRegionLayerStyle = feature => {
    const color = feature.get('COLOR') || '#eeeeee';
    return new Style({
        fill: new Fill({
            color,
        }),
    });
};

const ecoRegionLayer = new ColorLayer({
    name: 'ecoregions',
    extent,
    source: new VectorSource({
        format: new GeoJSON(),
        data: 'https://openlayers.org/data/vector/ecoregions.json',
        dataProjection: 'EPSG:4326',
        style: ecoRegionLayerStyle,
    }),
});

map.addLayer(ecoRegionLayer);

// Creates the country layer
const countryLayerStyle = new Style({
    stroke: new Stroke({
        color: 'black',
        width: 1,
    }),
});

const countryLayer = new ColorLayer({
    name: 'countries',
    extent,
    source: new VectorSource({
        format: new GeoJSON(),
        data: 'https://openlayers.org/en/v5.3.0/examples/data/geojson/countries.geojson',
        dataProjection: 'EPSG:4326',
        style: countryLayerStyle,
    }),
});

map.addLayer(countryLayer);

// Creates a custom vector layer
const geojson = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [102.0, 0.5],
            },
            properties: {
                prop0: 'value0',
            },
        },
        {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [102.0, 0.0],
                    [103.0, 1.0],
                    [104.0, 0.0],
                    [105.0, 1.0],
                ],
            },
            properties: {
                prop0: 'value0',
                prop1: 0.0,
            },
        },
        {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [
                        [100.0, 0.0],
                        [101.0, 0.0],
                        [101.0, 1.0],
                        [100.0, 1.0],
                        [100.0, 0.0],
                    ],
                ],
            },
            properties: {
                prop0: 'value0',
                prop1: { this: 'that' },
            },
        },
    ],
};

const customVectorLayerStyle = new Style({
    fill: new Fill({
        color: 'cyan',
    }),
    stroke: new Stroke({
        color: 'orange',
        width: 1,
    }),
});

const customVectorLayer = new ColorLayer({
    name: 'geojson',
    extent,
    source: new VectorSource({
        format: new GeoJSON(),
        data: geojson,
        dataProjection: 'EPSG:4326',
        style: customVectorLayerStyle,
    }),
});

map.addLayer(customVectorLayer);

StatusBar.bind(instance);

Inspector.attach(document.getElementById('panelDiv'), instance);
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));

instance.notifyChange(map);
