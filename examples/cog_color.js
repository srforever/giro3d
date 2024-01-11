import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import CogSource from '@giro3d/giro3d/sources/CogSource.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

import StatusBar from './widgets/StatusBar.js';

// Define geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    1818329.448, 1987320.770,
    6062229.082, 6231700.791,
);
const center = extent.centerAsVector3();

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Instantiate Giro3D
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x0a3b59,
    },
});

// Instantiate the camera
instance.camera.camera3D.position.set(center.x, center.y, 250000);

// Instantiate the controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.target.set(center.x, center.y + 1, center.z);

instance.useTHREEControls(controls);

// Construct a map and add it to the instance
const map = new Map('planar', { extent });
instance.add(map);

// Data coming from the same source as
// https://openlayers.org/en/latest/examples/cog-math-multisource.html
const source = new CogSource({
    url: 'https://3d.oslandia.com/giro3d/rasters/TCI.tif',
    crs: extent.crs(),
});
const layer = new ColorLayer({ name: 'color-layer', source, extent });

map.addLayer(layer);

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
