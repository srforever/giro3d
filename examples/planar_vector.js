import TileWMS from 'ol/source/TileWMS.js';
import Vector from 'ol/source/Vector.js';
import GPX from 'ol/format/GPX.js';
import KML from 'ol/format/KML.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Interpretation from '@giro3d/giro3d/core/layer/Interpretation.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/core/layer/LayerUpdateStrategy.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

import CoordinateBar from './widgets/CoordinateBar.js';

// # Planar (EPSG:3946) viewer

// Defines projection that we will use (taken from https://epsg.io/3946, Proj4js section)
Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3946',
    1837816.94334, 1847692.32501,
    5170036.4587, 5178412.82698,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the giro3d instance
const instance = new Instance(viewerDiv);

// Adds the map that will contain the layers.
const map = new Map('planar', { extent });
instance.add(map);

// Adds a WMS imagery layer
const wmsSource = new TileWMS({
    url: 'https://download.data.grandlyon.com/wms/grandlyon',
    projection: 'EPSG:3946',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['Ortho2018_Dalle_unique_8cm_CC46'],
        FORMAT: 'image/jpeg',
    },
    version: '1.3.0',
});

const colorLayer = new ColorLayer(
    'wms_imagery',
    {
        source: wmsSource,
        updateStrategy: {
            type: STRATEGY_DICHOTOMY,
            options: {},
        },
    },
);
map.addLayer(colorLayer);

// Adds a WMS elevation layer
const wmsSource2 = new TileWMS({
    url: 'https://download.data.grandlyon.com/wms/grandlyon',
    projection: 'EPSG:3946',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['MNT2018_Altitude_2m'],
        FORMAT: 'image/jpeg',
    },
    version: '1.3.0',
});

const elevationLayer = new ElevationLayer(
    'wms_elevation',
    {
        source: wmsSource2,
        interpretation: Interpretation.ScaleToMinMax(149, 621),
    },
);

map.addLayer(elevationLayer);

// Adds a first vector layer from a gpx file
const gpxSource = new Vector({
    url: 'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/lyon.gpx',
    // Defines the dataProjection to reproject the data,
    // KML and GPX specifications say that the crs is EPSG:4326.
    format: new GPX({ dataProjection: 'EPSG:3946' }),
});
// The loading of features is done asynchronously
gpxSource.loadFeatures();

// Creates the layer
const gpxLayer = new ColorLayer(
    'gpx',
    {
        source: gpxSource,
        projection: 'EPSG:3946',
    },
);
// Sets the style
gpxLayer.style = (Style, Fill, Stroke) => () => new Style({
    stroke: new Stroke({
        color: 'blue',
    }),
});
// If the features are not yet loaded when the layer is added to the map,
// this event listener will update the canvas after the end of feature loading.
gpxLayer.source.addEventListener('featuresloadend', () => {
    instance.notifyChange(gpxLayer);
});

map.addLayer(gpxLayer);

// Adds a second layer from a geojson file
const geoJsonSource = new Vector({
    url: 'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/lyon.geojson',
    format: new GeoJSON({ dataProjection: 'EPSG:3946' }),
});
geoJsonSource.loadFeatures();

const geoJsonLayer = new ColorLayer(
    'geo',
    {
        source: geoJsonSource,
        projection: 'EPSG:3946',
    },
);
geoJsonLayer.style = (Style, Fill, Stroke) => () => new Style({
    fill: new Fill({
        color: 'rgba(255, 165, 0, 0.2)',
        opacity: 0.2,
    }),
    stroke: new Stroke({
        color: 'white',
    }),
});
geoJsonLayer.source.addEventListener('featuresloadend', () => {
    instance.notifyChange(geoJsonLayer);
});

map.addLayer(geoJsonLayer);

// Adds a third source from a KML file
const kmlSource = new Vector({
    url: 'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/lyon.kml',
    format: new KML({ dataProjection: 'EPSG:3946' }),
});
kmlSource.loadFeatures();

const kmlLayer = new ColorLayer(
    'kml',
    {
        source: kmlSource,
        projection: 'EPSG:3946',
    },
);
kmlLayer.source.addEventListener('featuresloadend', () => {
    instance.notifyChange(kmlLayer);
});

// With KML format, there is not necessary to specify style rules,
// there are already present in the file.
// So, the layer can be directly add to the map.
map.addLayer(kmlLayer);

// Sets the camera position
const cameraPosition = new Coordinates(
    'EPSG:3946',
    extent.west(), extent.south(), 2000,
).xyz();
instance.camera.camera3D.position.copy(cameraPosition);

// Creates controls
const controls = new MapControls(
    instance.camera.camera3D,
    viewerDiv,
);
// Then looks at extent's center
controls.target = extent.center().xyz();
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

// Bind events
CoordinateBar.bind(instance);
