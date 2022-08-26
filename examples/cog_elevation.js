import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '../src/Core/Geographic/Extent.js';
import CogSource from '../src/sources/CogSource.js';
import Instance from '../src/Core/Instance.js';
import ColorLayer from '../src/Core/layer/ColorLayer.js';
import ElevationLayer from '../src/Core/layer/ElevationLayer.js';
import { Map } from '../src/entities/Map.js';

// Define projection that we will use (taken from https://epsg.io/32631, Proj4js section)
Instance.registerCRS('EPSG:32631','+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs');

// Define geographic extent: CRS, min/max X, min/max Y
var extent = new Extent(
    'EPSG:32631',
    665750, 666300,
    6553950, 6554350,
);
const center = extent.center().xyz();

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Instantiate Giro3D
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x0a3b59,
    },
});

// Instantiate the camera
instance.camera.camera3D.position.set(center.x, center.y, 1500);

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
const map = new Map('planar', { extent });
map.noTextureColor.r = 1.0;
// map.noTextureOpacity = 0.0;
instance.add(map);

const krakenSource = new CogSource({ url: './Kraken_COG.tiff' });
const krakenElevation = new ElevationLayer(
    'krakenElevation',
    { source: krakenSource, elevationFormat: 'cog', useAsObject: true },
);
map.addLayer(krakenElevation);

const resonSource = new CogSource({ url: './Reson_COG.tiff' });
const resonElevation = new ElevationLayer(
    'resonElevation',
    { source: resonSource, elevationFormat: 'cog', useAsObject: false },
);
map.addLayer(resonElevation);

/* const krakenColor = new ColorLayer('krakenColor', { source: krakenSource });
map.addLayer(krakenColor);
const resonColor = new ColorLayer('resonColor', { source: resonSource });
map.addLayer(resonColor); */

const imagerySource = new CogSource({ url: './Imagery_COG.tiff' });
const imageryColor = new ColorLayer('imageryColor', { source: imagerySource });
map.addLayer(imageryColor);