import { Fill, Stroke, Style } from 'ol/style.js';
import TileWMS from 'ol/source/TileWMS.js';
import GPX from 'ol/format/GPX.js';
import KML from 'ol/format/KML.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import BilFormat from '@giro3d/giro3d/formats/BilFormat.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import VectorSource from '@giro3d/giro3d/sources/VectorSource.js';

import StatusBar from './widgets/StatusBar.js';

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

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the giro3d instance
const instance = new Instance(viewerDiv, { crs: 'EPSG:3946' });

// Adds the map that will contain the layers.
const map = new Map('planar', { extent });
instance.add(map);

// Adds a WMS imagery layer
const colorSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://wxs.ign.fr/ortho/geoportail/r/wms',
        projection: 'EPSG:3946',
        params: {
            LAYERS: ['HR.ORTHOIMAGERY.ORTHOPHOTOS'],
            FORMAT: 'image/jpeg',
        },
    }),
});

const colorLayer = new ColorLayer({
    name: 'wms_imagery',
    extent,
    source: colorSource,
});
map.addLayer(colorLayer);

// Adds a WMS elevation layer
const elevationSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://wxs.ign.fr/altimetrie/geoportail/r/wms',
        projection: 'EPSG:3946',
        crossOrigin: 'anonymous',
        params: {
            LAYERS: ['ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES'],
            FORMAT: 'image/x-bil;bits=32',
        },
    }),
    format: new BilFormat(),
    noDataValue: -1000,
});

const elevationLayer = new ElevationLayer({
    name: 'wms_elevation',
    extent,
    source: elevationSource,
});

map.addLayer(elevationLayer);

// Creates the layer
const gpxLayer = new ColorLayer({
    name: 'gpx',
    extent,
    source: new VectorSource({
        data: 'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/lyon.gpx',
        dataProjection: 'EPSG:4326',
        format: new GPX(),
        style: new Style({
            stroke: new Stroke({
                color: 'blue',
            }),
        }),
    }),
});

map.addLayer(gpxLayer);

const geoJsonLayer = new ColorLayer({
    name: 'geo',
    extent,
    source: new VectorSource({
        data: 'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/lyon.geojson',
        format: new GeoJSON(),
        dataProjection: 'EPSG:3946',
        style: new Style({
            fill: new Fill({
                color: 'rgba(255, 165, 0, 0.2)',
                opacity: 0.2,
            }),
            stroke: new Stroke({
                color: 'white',
            }),
        }),
    }),
});

map.addLayer(geoJsonLayer);

// Adds a third source from a KML file.
// Note : with the KML format, styles are not necessary as they are contained in the file.
const kmlLayer = new ColorLayer({
    name: 'kml',
    extent,
    source: new VectorSource({
        data: 'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/lyon.kml',
        format: new KML(),
        dataProjection: 'EPSG:4326',
    }),
});

map.addLayer(kmlLayer);

// Sets the camera position
const cameraPosition = new Coordinates(
    'EPSG:3946',
    extent.west(), extent.south(), 2000,
).xyz();
instance.camera.camera3D.position.copy(cameraPosition);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);
// Then looks at extent's center
controls.target = extent.center().xyz();
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

// Bind events
StatusBar.bind(instance);
