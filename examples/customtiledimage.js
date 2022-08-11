import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '../src/Core/Geographic/Extent.js';
import Instance from '../src/Core/Instance.js';
import setupLoadingScreen from './js/loading_screen.js';
import ColorLayer from '../src/Core/layer/ColorLayer.js';
import ElevationLayer from '../src/Core/layer/ElevationLayer.js';
import { STRATEGY_DICHOTOMY } from '../src/Core/layer/LayerUpdateStrategy.js';
import Coordinates from '../src/Core/Geographic/Coordinates.js';
import { ELEVATION_FORMAT } from '../src/utils/DEMUtils.js';
import { Map } from '../src/entities/Map.js';
import CustomTiledImageSource from '../src/sources/CustomTiledImageSource.js';

proj4.defs('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
register(proj4);

const extent = new Extent(
    'EPSG:2154',
    929748, 974519, 6400582, 6444926,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the giro3d instance
const instance = new Instance(viewerDiv);
setupLoadingScreen(viewerDiv, instance);

// Adds the map that will contain the layers.
const map = new Map('planar', { extent });
instance.add(map);

// Adds our Elevation source & layer
// Source data from IGN BD ALTI https://geoservices.ign.fr/bdalti
const demSource = new CustomTiledImageSource({
    url: 'https://3d.oslandia.com/ecrins/ecrins-dem.json',
    networkOptions: { crossOrigin: 'same-origin' },
});
map.addLayer(new ElevationLayer('dem', {
    updateStrategy: {
        type: STRATEGY_DICHOTOMY,
        options: {},
    },
    source: demSource,
    elevationFormat: ELEVATION_FORMAT.HEIGHFIELD,
    heightFieldOffset: 711, // Altitude corresponding to 0 in heightfield
    heightFieldScale: 3574, // Altitude corresponding to 255 in heightfield
    projection: 'EPSG:2154',
}));

// Adds our Imagery source & layer
// Source data from Copernicus https://land.copernicus.eu/imagery-in-situ/european-image-mosaics/very-high-resolution/vhr-2012
const imagerySource = new CustomTiledImageSource({
    url: 'https://3d.oslandia.com/ecrins/ecrins.json',
    networkOptions: { crossOrigin: 'same-origin' },
});
map.addLayer(new ColorLayer('copernicus', {
    updateStrategy: {
        type: STRATEGY_DICHOTOMY,
        options: {},
    },
    source: imagerySource,
    projection: 'EPSG:2154',
}));

// Sets the camera position
const cameraPosition = new Coordinates(
    'EPSG:2154',
    extent.west(), extent.south(), 2000,
).xyz();
instance.camera.camera3D.position.copy(cameraPosition);

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
