import XYZ from 'ol/source/XYZ.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MAIN_LOOP_EVENTS } from '@giro3d/giro3d/core/MainLoop.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Interpretation from '@giro3d/giro3d/core/layer/Interpretation.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import StatusBar from './widgets/StatusBar.js';

const extent = new Extent('EPSG:3857',
    -13611854, -13593262,
    5806332, 5820603);

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv);

function createMap(mapExtent, tileset) {
    const key = 'pk.eyJ1IjoidG11Z3VldCIsImEiOiJjbGJ4dTNkOW0wYWx4M25ybWZ5YnpicHV6In0.KhDJ7W5N3d1z3ArrsDjX_A';
    const map = new Map(tileset, { extent: mapExtent, segments: 128 });
    instance.add(map);

    // Adds a XYZ elevation layer with MapBox terrain RGB tileset
    const elevationLayer = new ElevationLayer(
        'xyz_elevation',
        {
            source: new XYZ({
                url: `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${key}`,
                crossOrigin: 'anonymous',
                projection: extent.crs(),
            }),
            interpretation: Interpretation.MapboxTerrainRGB,
        },
    );
    map.addLayer(elevationLayer);

    // Adds a XYZ color layer with MapBox satellite tileset
    const colorLayer = new ColorLayer(
        'xyz_color',
        {
            source: new XYZ({
                url: `https://api.mapbox.com/v4/mapbox.${tileset}/{z}/{x}/{y}.webp?access_token=${key}`,
                crossOrigin: 'anonymous',
                projection: extent.crs(),
            }),
        },
    );
    map.addLayer(colorLayer);

    return { map, colorLayer, elevationLayer };
}

const split = extent.split(2, 1);

const naip = createMap(split[0], 'naip');
const satellite = createMap(split[1], 'satellite');

// Sets the camera position
const center = extent.center();
instance.camera.camera3D.position.set(center.x(), extent.north(), 10000);

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

Inspector.attach(document.getElementById('panelDiv'), instance);

const instanceProgress = document.getElementById('progress-instance');
const naipMapProgress = document.getElementById('progress-map1');
const color1Progress = document.getElementById('progress-color1');
const elevation1Progress = document.getElementById('progress-elevation1');
const satelliteMapProgress = document.getElementById('progress-map2');
const color2Progress = document.getElementById('progress-color2');
const elevation2Progress = document.getElementById('progress-elevation2');

function updateProgressBar(domElement, source) {
    domElement.style.width = `${Math.round(source.progress * 100)}%`;
}

// Let's poll the main loop: at each update, we can update the progress bars
instance.addFrameRequester(MAIN_LOOP_EVENTS.UPDATE_END, () => {
    updateProgressBar(instanceProgress, instance);

    updateProgressBar(naipMapProgress, naip.map);
    updateProgressBar(color1Progress, naip.colorLayer);
    updateProgressBar(elevation1Progress, naip.elevationLayer);

    updateProgressBar(satelliteMapProgress, satellite.map);
    updateProgressBar(color2Progress, satellite.colorLayer);
    updateProgressBar(elevation2Progress, satellite.elevationLayer);
});

StatusBar.bind(instance);
