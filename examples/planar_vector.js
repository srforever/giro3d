import { Fill, Stroke, Style, RegularShape } from 'ol/style.js';
import TileWMS from 'ol/source/TileWMS.js';
import GPX from 'ol/format/GPX.js';
import KML from 'ol/format/KML.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import GML32 from 'ol/format/GML32.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import BilFormat from '@giro3d/giro3d/formats/BilFormat.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import VectorSource from '@giro3d/giro3d/sources/VectorSource.js';

import StatusBar from './widgets/StatusBar.js';

// # Planar (EPSG:3946) viewer

// Defines projection that we will use (taken from https://epsg.io/3946, Proj4js section)
Instance.registerCRS(
    'EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);
Instance.registerCRS('EPSG:4171', '+proj=longlat +ellps=GRS80 +no_defs +type=crs');

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent('EPSG:3946', 1837816.94334, 1847692.32501, 5170036.4587, 5178412.82698);

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the Giro3D instance
const instance = new Instance(viewerDiv, { crs: 'EPSG:3946' });

// Adds the map that will contain the layers.
const map = new Map('planar', { extent });
instance.add(map);

// Adds a WMS imagery layer
const colorSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://data.geopf.fr/wms-r',
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
        url: 'https://data.geopf.fr/wms-r',
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

// Adds our first layer from a geojson file
// Initial source: https://data.grandlyon.com/jeux-de-donnees/parcs-places-jardins-indice-canopee-metropole-lyon/info
const geoJsonLayer = new ColorLayer({
    name: 'geojson',
    source: new VectorSource({
        data: 'https://3d.oslandia.com/lyon/evg_esp_veg.evgparcindiccanope_latest.geojson',
        // Defines the dataProjection to reproject the data,
        // GeoJSON specifications say that the crs should be EPSG:4326 but
        // here we are using a different one.
        dataProjection: 'EPSG:4171',
        format: new GeoJSON(),
        style: feature =>
            new Style({
                fill: new Fill({
                    color: `rgba(0, 128, 0, ${feature.get('indiccanop')})`,
                }),
                stroke: new Stroke({
                    color: 'white',
                }),
            }),
    }),
});
map.addLayer(geoJsonLayer);

// Adds a second vector layer from a gpx file
const gpxLayer = new ColorLayer({
    name: 'gpx',
    source: new VectorSource({
        data: 'https://3d.oslandia.com/lyon/track.gpx',
        // Defines the dataProjection to reproject the data,
        // KML and GPX specifications say that the crs is EPSG:4326.
        dataProjection: 'EPSG:4326',
        format: new GPX(),
        style: new Style({
            stroke: new Stroke({
                color: '#FA8C22',
                width: 2,
            }),
        }),
    }),
});
map.addLayer(gpxLayer);

// Adds a third source from a KML file
// Initial source: https://data.grandlyon.com/jeux-de-donnees/lignes-metro-funiculaire-reseau-transports-commun-lyonnais-v2/info
// Edited for convering to KML+adding proper colors
const kmlLayer = new ColorLayer({
    name: 'kml',
    source: new VectorSource({
        data: 'https://3d.oslandia.com/lyon/tcl_sytral.tcllignemf_2_0_0.kml',
        dataProjection: 'EPSG:3946',
        format: new KML(),
        // With KML format, there is not necessary to specify style rules,
        // there are already present in the file.
    }),
});
map.addLayer(kmlLayer);

// Adds our fourth layer from a gml file
// Initial source: https://data.grandlyon.com/jeux-de-donnees/bornes-fontaine-metropole-lyon/info
// Edited for having a simple GML FeatureCollection
const gmlLayer = new ColorLayer({
    name: 'gml',
    source: new VectorSource({
        data: 'https://3d.oslandia.com/lyon/adr_voie_lieu.adrbornefontaine_latest.gml',
        dataProjection: 'EPSG:4171',
        format: new GML32(),
        style: (feature, resolution) => {
            const meters = 1 / resolution; // Assuming pixel ratio is 1
            // We want to display a 5*5m square, except
            // for when we're too far away, use a 2*2px square
            const size = Math.max(5 * meters, 2);
            return new Style({
                image: new RegularShape({
                    radius: size,
                    points: 4,
                    stroke: new Stroke({
                        width: 1,
                        color: [255, 255, 255, 1],
                    }),
                    fill: new Fill({
                        color: [0, 0, 128, 1],
                    }),
                }),
            });
        },
    }),
});
map.addLayer(gmlLayer);

// Sets the camera position
instance.camera.camera3D.position.set(extent.west(), extent.south(), 2000);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);
// Then looks at extent's center
controls.target = extent.centerAsVector3();
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

const resultTable = document.getElementById('results');
instance.domElement.addEventListener('mousemove', e => {
    const pickedObject = instance
        .pickObjectsAt(e, {
            radius: 5,
            limit: 1,
            pickFeatures: true,
            sortByDistance: true,
        })
        .at(0);
    resultTable.innerHTML = '';
    if (pickedObject?.features && pickedObject.features.length > 0) {
        for (const { layer, feature } of pickedObject.features) {
            const layerName = layer.name;
            const featureName = feature.get('nom') ?? feature.get('name') ?? feature.get('gid');
            resultTable.innerHTML += `${layerName}: ${featureName}<br>`;
        }
    }
});

// Bind events
StatusBar.bind(instance);
