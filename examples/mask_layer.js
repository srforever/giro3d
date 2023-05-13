import XYZ from 'ol/source/XYZ.js';
import Vector from 'ol/source/Vector.js';
import { GeoJSON } from 'ol/format.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import MaskLayer, { MaskMode } from '@giro3d/giro3d/core/layer/MaskLayer.js';
import Fetcher from '@giro3d/giro3d/utils/Fetcher.js';
import StatusBar from './widgets/StatusBar.js';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = Extent.fromCenterAndSize('EPSG:3857', { x: 260000, y: 6251379 }, 32000, 32000);

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: false,
    },
});

const apiKey = 'pk.eyJ1IjoidG11Z3VldCIsImEiOiJjbGJ4dTNkOW0wYWx4M25ybWZ5YnpicHV6In0.KhDJ7W5N3d1z3ArrsDjX_A';

// Adds the map that will contain the layers.
const map = new Map('Paris', { extent, segments: 128 });

instance.add(map);

// Adds a satellite basemap
const basemap = new ColorLayer(
    'basemap',
    {
        source: new XYZ({
            url: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.webp?access_token=${apiKey}`,
            crossOrigin: 'anonymous',
            projection: extent.crs(),
        }),
    },
);
map.addLayer(basemap);

const format = new GeoJSON();
const source = new Vector({ });
Fetcher.json('https://3d.oslandia.com/giro3d/vectors/paris.geojson')
    .then(geojson => {
        const features = format.readFeatures(geojson);
        source.addFeatures(features);
    });

// Display the footprint using a red outline. This layer is not necessary for the mask to work,
// and is only present for illustration purposes.
const outline = new ColorLayer('outline', { source });

outline.style = (Style, Fill, Stroke) => function _() {
    return new Style({
        stroke: new Stroke({ color: 'red', width: 2 }),
    });
};

map.addLayer(outline);

// Create the actual mask layer with the same source as the outline.
const mask = new MaskLayer('mask', { source });

// The mask layer uses an opaque fill style.
mask.style = (Style, Fill) => function _() {
    return new Style({
        fill: new Fill({ color: 'white' }),
    });
};

map.addLayer(mask);

// Sets the camera position
const center = extent.center();
instance.camera.camera3D.position.set(center.x(), center.y() - 1, 40000);

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
StatusBar.bind(instance);

document.getElementById('layerState').addEventListener('change', e => {
    const newMode = parseInt(e.target.value, 10);

    switch (newMode) {
        case 1:
            mask.visible = true;
            mask.maskMode = MaskMode.Normal;
            break;
        case 2:
            mask.visible = true;
            mask.maskMode = MaskMode.Inverted;
            break;
        default:
            mask.visible = false;
            break;
    }

    instance.notifyChange(map);
});
