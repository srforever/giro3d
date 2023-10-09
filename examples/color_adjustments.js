import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import TileWMS from 'ol/source/TileWMS.js';

import Instance from '@giro3d/giro3d/core/Instance.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import BilFormat from '@giro3d/giro3d/formats/BilFormat.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';

import StatusBar from './widgets/StatusBar.js';

const viewer = document.getElementById('viewerDiv');
Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const instance = new Instance(viewer, { crs: 'EPSG:3946' });

const xmin = 1837816.94334;
const xmax = 1847692.32501;
const ymin = 5170036.4587;
const ymax = 5178412.82698;

const extent = new Extent('EPSG:3946', xmin, xmax, ymin, ymax);

const map = new Map('city-of-lyon', { extent });
instance.add(map);

const satelliteSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://wxs.ign.fr/ortho/geoportail/r/wms',
        projection: 'EPSG:3946',
        params: {
            LAYERS: ['HR.ORTHOIMAGERY.ORTHOPHOTOS'],
            FORMAT: 'image/jpeg',
        },
    }),
});

const colorLayer = new ColorLayer('satellite', {
    source: satelliteSource,
    extent: map.extent,
});
map.addLayer(colorLayer);

const demSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://wxs.ign.fr/altimetrie/geoportail/r/wms',
        projection: 'EPSG:3946',
        crossOrigin: 'anonymous',
        params: {
            LAYERS: ['ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES'],
            FORMAT: 'image/x-bil;bits=32',
        },
    }),
    format: new BilFormat(),
    noDataValue: -1000,
});

const elevationLayer = new ElevationLayer(
    'dem',
    {
        extent: map.extent,
        source: demSource,
    },
);
map.addLayer(elevationLayer);

const camera = instance.camera.camera3D;
const cameraAltitude = 2000;

const cameraPosition = new THREE.Vector3(
    extent.west(),
    extent.south(),
    cameraAltitude,
);
camera.position.copy(cameraPosition);

const controls = new MapControls(camera, instance.domElement);
controls.target = extent.center().xyz();

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

controls.saveState();

instance.useTHREEControls(controls);

const options = {
    brightness: 0,
    contrast: 1,
    saturation: 1,
};

function update() {
    colorLayer.brightness = options.brightness;
    colorLayer.contrast = options.contrast;
    colorLayer.saturation = options.saturation;
    instance.notifyChange(map);
}

const sliderBrightness = document.getElementById('slider-brightness');
sliderBrightness.oninput = function oninput() {
    options.brightness = Number(sliderBrightness.value);
    update();
};

const sliderContrast = document.getElementById('slider-contrast');
sliderContrast.oninput = function oninput() {
    options.contrast = Number(sliderContrast.value);
    update();
};

const sliderSaturation = document.getElementById('slider-saturation');
sliderSaturation.oninput = function oninput() {
    options.saturation = Number(sliderSaturation.value);
    update();
};

update();

Inspector.attach(document.getElementById('panelDiv'), instance);

StatusBar.bind(instance);
