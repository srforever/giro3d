import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '../src/Core/Geographic/Extent.js';
import CogSource from '../src/sources/CogSource.js';
import Instance from '../src/Core/Instance.js';
import ColorLayer from '../src/Core/layer/ColorLayer.js';
import { Map } from '../src/entities/Map.js';

// Define projection that we will use (taken from https://epsg.io/32633, Proj4js section)
proj4.defs('EPSG:32633', '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs');
register(proj4);

// Define geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:32633',
    499980, 609780,
    1790220, 1900020,
);
const center = extent.center().xyz();

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Instantiate Giro3D
const instance = new Instance(viewerDiv, { crs: extent.crs() });
instance.mainLoop.gfxEngine.renderer.setClearColor(0x0a3b59);

// Instantiate the camera
instance.camera.camera3D.position.set(center.x, center.y, 250000);

// Instantiate the controls
const controls = new OrbitControls(
    instance.camera.camera3D,
    viewerDiv,
);
controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.target.set(center.x, center.y, center.z);

instance.useTHREEControls(controls);

// Construct a map and add it to the instance
const map = new Map('planar', { extent });
map.disableSkirt = true;
instance.add(map);

const source = new CogSource({
    url: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/2020/S2A_36QWD_20200701_0_L2A/B08.tif',
});

// Add the COG Layer as a color layer to the map
// See https://docs.sentinel-hub.com/api/latest/data/
const cogLayer = new ColorLayer('cog', { source });
map.addLayer(cogLayer);
