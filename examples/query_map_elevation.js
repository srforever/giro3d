import { Color, Fog } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import XYZ from 'ol/source/XYZ.js';

import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import MapboxTerrainFormat from '@giro3d/giro3d/formats/MapboxTerrainFormat.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

import StatusBar from './widgets/StatusBar.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS(
    'EPSG:2154',
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
);

const SKY_COLOR = '#87CEEB';
const size = 200_000;
const extent = Extent.fromCenterAndSize('EPSG:2154', { x: 1_051_908, y: 6_542_409 }, size, size);

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a Giro3D instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: SKY_COLOR,
    },
});

// Creates a map that will contain the layer
const map = new Map('alps', {
    extent,
    hillshading: {
        enabled: true,
        elevationLayersOnly: true,
    },
    doubleSided: true,
    backgroundColor: 'gray',
});

instance.add(map);

const key =
    'pk.eyJ1IjoidG11Z3VldCIsImEiOiJjbGJ4dTNkOW0wYWx4M25ybWZ5YnpicHV6In0.KhDJ7W5N3d1z3ArrsDjX_A';

// Adds a XYZ elevation layer with MapBox terrain RGB tileset
const elevationLayer = new ElevationLayer({
    name: 'xyz_elevation',
    extent,
    source: new TiledImageSource({
        format: new MapboxTerrainFormat(),
        source: new XYZ({
            url: `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${key}`,
            projection: 'EPSG:3857',
            crossOrigin: 'anonymous',
        }),
    }),
});
map.addLayer(elevationLayer);

// Adds a XYZ color layer with MapBox satellite tileset
const satelliteLayer = new ColorLayer({
    name: 'xyz_color',
    extent,
    source: new TiledImageSource({
        source: new XYZ({
            url: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.webp?access_token=${key}`,
            projection: 'EPSG:3857',
            crossOrigin: 'anonymous',
        }),
    }),
});
map.addLayer(satelliteLayer);

const controls = new MapControls(instance.camera.camera3D, instance.domElement);

const center = extent.centerAsVector2();
instance.camera.camera3D.position.set(994_410, 6_520_646, 5_520);
controls.target.set(1_011_954, 6_539_864, 1_000);

instance.useTHREEControls(controls);

// Here we have a list of summits of the Alps and their geographic coordinates,
// but without any elevation information
const summits = [
    { latitude: 45.832866, longitude: 6.864824, name: 'Mont Blanc' },
    { latitude: 45.976389, longitude: 7.658333, name: 'Matterhorn' },
    { latitude: 45.8667, longitude: 6.98333, name: 'Grandes Jorasses' },
    { latitude: 45.930835, longitude: 6.989466, name: 'Les Droites' },
    { latitude: 45.95, longitude: 7.3, name: 'Grand Combin' },
];
const summitMarkers = [];

function updateMarker(marker) {
    const { x, y } = marker.position;
    const coordinates = new Coordinates(instance.referenceCrs, x, y);
    const result = map.getElevation({ coordinates });
    if (result.samples.length > 0) {
        result.samples.sort((a, b) => a.resolution - b.resolution);
        const sample = result.samples[0];

        marker.position.setZ(sample.elevation);
        marker.updateMatrixWorld(true);
    }
}

function updateMarkers(extent) {
    for (const marker of summitMarkers) {
        const { x, y } = marker.position;
        const coordinates = new Coordinates(instance.referenceCrs, x, y);

        // Only update markers that are inside the updated area
        if (extent.isPointInside(coordinates)) {
            updateMarker(marker);
        }
    }
}

async function loadMarker(summit) {
    const { name, latitude, longitude } = summit;

    const markerHtmlElement = document.createElement('div');
    markerHtmlElement.style.paddingBottom = '4rem';
    const span = document.createElement('span');
    span.classList = 'badge rounded-pill text-bg-dark';
    span.innerText = summit.name;
    markerHtmlElement.appendChild(span);

    const marker = new CSS2DObject(markerHtmlElement);
    marker.name = name;

    // Let's convert our summit coordinates from EPSG:4326 to EPSG:2154
    const coordinates = new Coordinates('EPSG:4326', longitude, latitude).as(instance.referenceCrs);
    marker.position.set(coordinates.x, coordinates.y, 0);

    instance.add(marker);

    marker.updateMatrixWorld(true);
    summitMarkers.push(marker);

    updateMarker(marker);
}

for (const summit of summits) {
    loadMarker(summit);
}

// Let's update the markers' elevations whenever there is some new elevation data loaded on the map
map.addEventListener('elevation-changed', ({ extent }) => updateMarkers(extent));

const fog = new Fog(new Color(SKY_COLOR), 1000, 200_000);
instance.scene.fog = fog;

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
