import colormap from 'colormap';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    Color,
} from 'three';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import CogSource from '@giro3d/giro3d/sources/CogSource.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import ColorMap, { ColorMapMode } from '@giro3d/giro3d/core/layer/ColorMap.js';

import StatusBar from './widgets/StatusBar.js';

const extent = new Extent(
    'EPSG:3857',
    -13581040.085, -13469591.026,
    5780261.830, 5942165.048,
);

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Instantiate Giro3D
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
});

// Instantiate the camera
instance.camera.camera3D.position.set(-13656319, 5735451, 88934);

// Instantiate the controls
const controls = new MapControls(
    instance.camera.camera3D,
    viewerDiv,
);
controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.target.set(-13545408, 5837154, 0);
instance.useTHREEControls(controls);

// Construct a map and add it to the instance
const map = new Map('planar', {
    extent,
    segments: 128,
    discardNoData: true,
    backgroundColor: 'gray',
    hillshading: true,
});
instance.add(map);

// Use an elevation COG with nodata values
const source = new CogSource({
    // https://www.sciencebase.gov/catalog/item/632a9a9ad34e71c6d67b95a3
    url: 'https://3d.oslandia.com/cog_data/COG_EPSG3857_USGS_13_n47w122_20220919.tif',
});

const values = colormap({ colormap: 'viridis' });
const colors = values.map(v => new Color(v));

const min = 263;
const max = 4347;

// Display it as elevation and color
const colorMap = new ColorMap(colors, min, max, ColorMapMode.Elevation);
map.addLayer(new ElevationLayer('elevation', { source, colorMap, minmax: { min, max } }));

// Attach the inspector
Inspector.attach(document.getElementById('panelDiv'), instance);

// Bind events
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));

const toggle = document.getElementById('colormap-enable');
toggle.onchange = () => {
    colorMap.active = toggle.checked;
    instance.notifyChange(map);
};

StatusBar.bind(instance);
