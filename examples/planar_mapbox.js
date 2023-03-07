import XYZ from 'ol/source/XYZ.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Interpretation from '@giro3d/giro3d/core/layer/Interpretation.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

import CoordinateBar from './widgets/CoordinateBar.js';

// Defines projection that we will use (taken from https://epsg.io/3857, Proj4js section)
Instance.registerCRS('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs');

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent('EPSG:3857', 659030, 735596, 5535152, 5647497);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the giro3d instance
const instance = new Instance(viewerDiv);

// Adds the map that will contain the layers.
const map = new Map('planar', { extent, segments: 128 });
instance.add(map);

function addLayers(key) {
    const layers = map.getLayers();
    for (const current of layers) {
        map.removeLayer(current);
    }

    // Adds a XYZ elevation layer with MapBox terrain RGB tileset
    const elevationLayer = new ElevationLayer(
        'xyz_elevation',
        {
            source: new XYZ({
                url: `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${key}`,
                crossOrigin: 'anonymous',
                projection: extent.crs(),
            }),
            interpretation: Interpretation.MapboxTerrainRGB,
        },
    );
    map.addLayer(elevationLayer);

    // Adds a XYZ color layer with MapBox satellite tileset
    const satelliteLayer = new ColorLayer(
        'xyz_color',
        {
            source: new XYZ({
                url: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.pngraw?access_token=${key}`,
                crossOrigin: 'anonymous',
                projection: extent.crs(),
            }),
        },
    );
    map.addLayer(satelliteLayer);
}

// Create our elevation layer using giro3d's default mapbox api key
addLayers('pk.eyJ1IjoidG11Z3VldCIsImEiOiJjbGJ4dTNkOW0wYWx4M25ybWZ5YnpicHV6In0.KhDJ7W5N3d1z3ArrsDjX_A');

// Sets the camera position
instance.camera.camera3D.position.set(extent.east(), extent.south(), 2000);

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

document.getElementById('mapboxApi').addEventListener('submit', e => {
    e.preventDefault();
    addLayers(document.getElementById('mapboxApiKey').value);
});

// Bind events
CoordinateBar.bind(instance);
