import colormap from 'colormap';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Color } from 'three';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import CogSource from '@giro3d/giro3d/sources/CogSource.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import ColorMap, { ColorMapMode } from '@giro3d/giro3d/core/layer/ColorMap.js';
import StatusBar from './widgets/StatusBar.js';

// Define projection that we will use (taken from https://epsg.io/26910, Proj4js section)
Instance.registerCRS(
    'EPSG:26910',
    '+proj=utm +zone=10 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
);

const extent = new Extent(
    'EPSG:26910',
    532622, 569790,
    5114416, 5137240,
);

const center = extent.center().xyz();

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Instantiate Giro3D
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 'black',
        checkShaderErrors: false,
    },
});

// Instantiate the camera
instance.camera.camera3D.position.set(center.x, center.y - 1, 50000);

// Instantiate the controls
const controls = new MapControls(
    instance.camera.camera3D,
    viewerDiv,
);
controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.target.set(center.x, center.y, center.z);
instance.useTHREEControls(controls);

// Construct a map and add it to the instance
const map = new Map('planar', {
    extent,
    doubleSided: true,
    discardNoData: true,
    backgroundColor: new Color(0, 0, 0),
    hillshading: true,
    segments: 128,
});
instance.add(map);

// Use an elevation COG with nodata values
const source = new CogSource({
    // https://pubs.er.usgs.gov/publication/ds904
    url: 'https://3d.oslandia.com/dem/msh2009dem.tif',
});

const values = colormap({ colormap: 'viridis' });
const colors = values.map(v => new Color(v));

const min = 227;
const max = 2538;

// Display it as elevation and color
const colorMap = new ColorMap(colors, min, max, ColorMapMode.Elevation);
map.addLayer(new ElevationLayer('elevation', { source, colorMap, minmax: { min, max } }));

// Attach the inspector
Inspector.attach(document.getElementById('panelDiv'), instance);

const toggle = document.getElementById('discard-nodata');
toggle.onchange = () => {
    map.materialOptions.discardNoData = toggle.checked;
    instance.notifyChange(map);
};

// Bind events
StatusBar.bind(instance);
