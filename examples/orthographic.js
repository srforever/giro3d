import Stamen from 'ol/source/Stamen.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '../src/Core/Geographic/Extent.js';
import Instance from '../src/Core/Instance.js';
import ColorLayer from '../src/Core/layer/ColorLayer.js';
import setupLoadingScreen from './js/loading_screen.js';
import { Map } from '../src/entities/Map.js';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    -20037508.342789244, 20037508.342789244,
    -20037508.342789244, 20037508.342789244,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv, { crs: extent.crs() });
instance.mainLoop.gfxEngine.renderer.setClearColor(0x0a3b59);

setupLoadingScreen(viewerDiv, instance);

// Creates a map that will contain the layer
const map = new Map('planar', { extent, maxSubdivisionLevel: 10 });

// By default giro3d' tiles geometry have a "skirt" (ie they have a height),
// but in case of orthographic we don't need this feature, so disable it
map.disableSkirt = true;

instance.add(map);

// Adds an TMS imagery layer
const stamenSource = new Stamen({ layer: 'watercolor', wrapX: false });
map.addLayer(new ColorLayer(
    'osm',
    {
        source: stamenSource,
    },
)).catch(e => console.error(e));

// Instanciates camera
const camera = instance.camera.camera3D;
camera.position.set(0, 0, 25000000);

// Instanciates controls
const controls = new MapControls(camera, viewerDiv);

instance.addFrameRequester('before_camera_update', () => {
    controls.update();
});

controls.addEventListener('change', () => {
    instance.notifyChange(camera);
});
