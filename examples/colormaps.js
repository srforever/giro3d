import colormap from 'colormap';
import { Color } from 'three';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import Interpretation from '@giro3d/giro3d/core/layer/Interpretation.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import CustomTiledImageSource from '@giro3d/giro3d/sources/CustomTiledImageSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import ColorMap from '@giro3d/giro3d/core/layer/ColorMap.js';
import ColorMapMode from '@giro3d/giro3d/core/layer/ColorMapMode.js';

Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

const extent = new Extent(
    'EPSG:2154',
    929748, 974519, 6400582, 6444926,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

const colorLayerMode = document.getElementById('colorLayerMode');
const elevationLayerMode = document.getElementById('elevationLayerMode');
const colorLayerGradient = document.getElementById('colorLayerGradient');
const elevationLayerGradient = document.getElementById('elevationLayerGradient');
const elevationLayerEnabled = document.getElementById('elevationLayerEnabled');
const colorLayerEnabled = document.getElementById('colorLayerEnabled');

// Creates the giro3d instance
const instance = new Instance(viewerDiv);

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

const elevationMin = 711; // Altitude corresponding to 0 in heightfield
const elevationMax = 3574; // Altitude corresponding to 255 in heightfield

function makeColorRamp(preset) {
    const values = colormap({ colormap: preset });
    const colors = values.map(v => new Color(v));

    return colors;
}

const colorRamps = {};

colorRamps.viridis = makeColorRamp('viridis');
colorRamps.jet = makeColorRamp('jet');
colorRamps.blackbody = makeColorRamp('blackbody');
colorRamps.earth = makeColorRamp('earth');
colorRamps.bathymetry = makeColorRamp('bathymetry');
colorRamps.magma = makeColorRamp('magma');
colorRamps.par = makeColorRamp('par');

// Adds the map that will contain the layers.
const map = new Map('planar', {
    extent,
    segments: 128,
    hillshading: true,
});
instance.add(map);

// Adds our Elevation source & layer
// Source data from IGN BD ALTI https://geoservices.ign.fr/bdalti
const demSource = new CustomTiledImageSource({
    url: 'https://3d.oslandia.com/ecrins/ecrins-dem.json',
    networkOptions: { crossOrigin: 'same-origin' },
});

const elevationLayer = new ElevationLayer('elevation', {
    colorMap: new ColorMap(
        colorRamps[elevationLayerGradient.value],
        elevationMin,
        elevationMax,
        getMode(elevationLayerMode.value),
    ),
    source: demSource,
    interpretation: Interpretation.ScaleToMinMax(elevationMin, elevationMax),
    projection: 'EPSG:2154',
});

const colorLayer = new ColorLayer('color', {
    colorMap: new ColorMap(
        colorRamps[colorLayerGradient.value],
        elevationMin,
        elevationMax,
        getMode(colorLayerMode.value),
    ),
    source: demSource,
    interpretation: Interpretation.ScaleToMinMax(elevationMin, elevationMax),
    projection: 'EPSG:2154',
});

map.addLayer(elevationLayer);
map.addLayer(colorLayer);

elevationLayerEnabled.onchange = updateColorMaps;
colorLayerEnabled.onchange = updateColorMaps;
colorLayerGradient.addEventListener('change', () => updateColorMaps());
colorLayerMode.addEventListener('change', () => updateColorMaps());
elevationLayerMode.addEventListener('change', () => updateColorMaps());
elevationLayerGradient.addEventListener('change', () => updateColorMaps());

function getMode(name) {
    switch (name) {
        case 'slope': return { mode: ColorMapMode.Slope, min: 0, max: 50 };
        case 'aspect': return { mode: ColorMapMode.Aspect, min: 0, max: 360 };
        default: return { mode: ColorMapMode.Elevation, min: elevationMin, max: elevationMax };
    }
}

function updateColorMaps() {
    elevationLayer.colorMap.active = elevationLayerEnabled.checked;

    if (elevationLayerEnabled.checked) {
        elevationLayer.colorMap.colors = colorRamps[elevationLayerGradient.value];
        const { mode, min, max } = getMode(elevationLayerMode.value);
        elevationLayer.colorMap.mode = mode;
        elevationLayer.colorMap.min = min;
        elevationLayer.colorMap.max = max;
    }

    colorLayer.visible = colorLayerEnabled.checked;

    if (colorLayerEnabled.checked) {
        colorLayer.colorMap.colors = colorRamps[colorLayerGradient.value];
        const { mode, min, max } = getMode(colorLayerMode.value);
        colorLayer.colorMap.mode = mode;
        colorLayer.colorMap.min = min;
        colorLayer.colorMap.max = max;
    }

    instance.notifyChange(map);
}

updateColorMaps();

Inspector.attach(document.getElementById('panelDiv'), instance);
