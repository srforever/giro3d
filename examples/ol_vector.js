import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Vector from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    -20037508.342789244, 20037508.342789244,
    -20037508.342789244, 20037508.342789244,
);

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0xFFFFFF,
    },
});

// Instanciates camera
instance.camera.camera3D.position.set(0, 0, 10000000);

// Instanciates controls
const controls = new MapControls(
    instance.camera.camera3D,
    instance.domElement,
);
controls.enableDamping = true;
controls.dampingFactor = 0.25;

instance.useTHREEControls(controls);

// Adds layers in a map

const map = new Map('planar', { extent, maxSubdivisionLevel: 15 });
instance.add(map);

// Creates the ecoregion layer
const vectorSource1 = new Vector({
    url: 'https://openlayers.org/data/vector/ecoregions.json',
    format: new GeoJSON({}),
});
vectorSource1.once('featuresloadend', () => {
    instance.notifyChange(map);
});
vectorSource1.loadFeatures();

const ecoRegionLayer = new ColorLayer(
    'vec',
    {
        source: vectorSource1,
    },
);

// eslint-disable-next-line no-unused-vars
ecoRegionLayer.style = (Style, Fill, Stroke) => feature => {
    const color = feature.get('COLOR') || '#eeeeee';
    return new Style({
        fill: new Fill({
            color,
        }),
    });
};

map.addLayer(ecoRegionLayer);

// Creates the country layer
const vectorSource2 = new Vector({
    url: 'https://openlayers.org/en/v5.3.0/examples/data/geojson/countries.geojson',
    format: new GeoJSON({ featureProjection: 'EPSG:3857' }),
});
vectorSource2.once('featuresloadend', () => {
    instance.notifyChange(map);
});
vectorSource2.loadFeatures();

const countryLayer = new ColorLayer(
    'vec2',
    {
        source: vectorSource2,
    },
);

countryLayer.style = (Style, Fill, Stroke) => () => new Style({
    stroke: new Stroke({
        color: 'black',
        width: 1,
    }),
});

map.addLayer(countryLayer);

// Creates a custom vector layer
const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
const feature = format.readFeature({
    type: 'Feature',
    geometry: {
        type: 'MultiPolygon',
        coordinates: [
            [
                [
                    [-46, -30],
                    [-41, -30],
                    [-41, -35],
                    [-46, -35],
                    [-46, -30],
                ],
                [
                    [-45, -31],
                    [-42, -31],
                    [-42, -34],
                    [-45, -31],

                ],
            ],
            [
                [
                    [-47.900390625, -14.944784875088372],
                    [-51.591796875, -19.91138351415555],
                    [-41.11083984375, -21.309846141087192],
                    [-43.39599609375, -15.390135715305204],
                    [-47.900390625, -14.944784875088372],
                ],
                [
                    [-46.6259765625, -17.14079039331664],
                    [-47.548828125, -16.804541076383455],
                    [-46.23046874999999, -16.699340234594537],
                    [-45.3515625, -19.31114335506464],
                    [-46.6259765625, -17.14079039331664],
                ],
                [
                    [-44.40673828125, -18.375379094031825],
                    [-44.4287109375, -20.097206227083888],
                    [-42.9345703125, -18.979025953255267],
                    [-43.52783203125, -17.602139123350838],
                    [-44.40673828125, -18.375379094031825],
                ],
            ],
        ],
    },
});

const featureLine = format.readFeature({
    type: 'Feature',
    geometry: {
        type: 'LineString',
        coordinates: [[-30, -30], [-15, -15], [-15, -30], [-30, -45]],
    },
});

const featurePoints = format.readFeature({
    type: 'Feature',
    geometry: {
        type: 'MultiPoint',
        coordinates: [[-25, -25], [-15, -15], [-30, -30]],
    },
});

const vectorSource3 = new Vector({});
vectorSource3.addFeatures([feature, featureLine, featurePoints]);

const customVectorLayer = new ColorLayer(
    'vec3',
    {
        source: vectorSource3,
    },
);
customVectorLayer.style = (Style, Fill, Stroke) => () => new Style({
    fill: new Fill({
        color: 'cyan',
    }),
    stroke: new Stroke({
        color: 'orange',
        width: 1,
    }),
});

map.addLayer(customVectorLayer);

Inspector.attach(document.getElementById('panelDiv'), instance);
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));

instance.notifyChange(map);
