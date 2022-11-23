import { Lut } from 'three/examples/jsm/math/Lut.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';

import Extent from '@giro3d/giro3d/Core/Geographic/Extent.js';
import Instance from '@giro3d/giro3d/Core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/Core/layer/ElevationLayer.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/Core/layer/LayerUpdateStrategy.js';
import Coordinates from '@giro3d/giro3d/Core/Geographic/Coordinates.js';
import { ELEVATION_FORMAT } from '@giro3d/giro3d/utils/DEMUtils.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import CustomTiledImageSource from '@giro3d/giro3d/sources/CustomTiledImageSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

const extent = new Extent(
    'EPSG:2154',
    929748, 974519, 6400582, 6444926,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');
const coloringOptions = document.getElementById('coloringOptions');
const colormapOptions = document.getElementById('colormapOptions');

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

// Create the different Look Up Tables (LUT) with 256 colors
const luts = {};
const threeLut = new Lut();
for (const colormap of ['rainbow', 'cooltowarm', 'blackbody', 'grayscale']) {
    luts[colormap] = new Float32Array(256 * 3);
    threeLut.setColorMap(colormap, 256);
    for (let i = 0; i < 256; i++) {
        const i3 = i * 3;
        const color = threeLut.getColor(i / 255.0);
        luts[colormap][i3 + 0] = color.r;
        luts[colormap][i3 + 1] = color.g;
        luts[colormap][i3 + 2] = color.b;
    }
}

// Add the custom LUT
luts.custom = new Float32Array([
    0.0, 0.0, 1.0,
    0.0, 1.0, 0.0,
    1.0, 0.0, 0.0,
    1.0, 1.0, 1.0,
]);

const elevationMin = 711; // Altitude corresponding to 0 in heightfield
const elevationMax = 3574; // Altitude corresponding to 255 in heightfield

const coloringModes = {
    elevation: 0,
    slope: 1,
    aspect: 2,
};
const coloringBounds = {
    elevation: [elevationMin, elevationMax],
    slope: [0, 90],
    aspect: [0, 360],
};

// Adds the map that will contain the layers.
const map = new Map('planar', {
    extent,
    hillshading: true,
    colormap: {
        mode: coloringModes[coloringOptions.value],
        min: coloringBounds[coloringOptions.value][0],
        max: coloringBounds[coloringOptions.value][1],
        lut: luts[colormapOptions.value],
    },
});
map.segments = 128;
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
    heightFieldOffset: elevationMin,
    heightFieldScale: elevationMax,
    projection: 'EPSG:2154',
}));

const colorMapCheckbox = document.getElementById('colorMapCheckbox');

colorMapCheckbox.oninput = function oninput() {
    updateColorMap();
};

function updateColorMap() {
    if (colorMapCheckbox.checked) {
        map.materialOptions.colormap = {};
        map.materialOptions.colormap.lut = luts[colormapOptions.value];
        map.materialOptions.colormap.mode = coloringModes[coloringOptions.value];
        map.materialOptions.colormap.min = coloringBounds[coloringOptions.value][0];
        map.materialOptions.colormap.max = coloringBounds[coloringOptions.value][1];
    } else {
        map.materialOptions.colormap = undefined;
    }
    instance.notifyChange(map);
}
document.getElementById('coloringOptions').addEventListener('change', () => updateColorMap());

colormapOptions.addEventListener('change', () => updateColorMap());

updateColorMap();

Inspector.attach(document.getElementById('panelDiv'), instance);
