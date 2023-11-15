import StadiaMaps from 'ol/source/StadiaMaps.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import StatusBar from './widgets/StatusBar.js';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    -20037508.342789244, 20037508.342789244,
    -20037508.342789244, 20037508.342789244,
);

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x000000,
    },
});

// Instanciates camera
instance.camera.camera3D.position.set(0, 0, 25000000);

// Instanciates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

instance.useTHREEControls(controls);

const layersAdded = [];
const layersRemoved = [];

const removeLayerButton = document.getElementById('removeLayer');
const addLayerButton = document.getElementById('addLayer');

function updateButtonStates() {
    addLayerButton.disabled = layersRemoved.length === 0;
    removeLayerButton.disabled = layersAdded.length === 0;
}

const map = new Map('planar', { extent, maxSubdivisionLevel: 13 });
instance.add(map);

function createLayer(name) {
    return new ColorLayer(
        name,
        {
            extent,
            source: new TiledImageSource({ source: new StadiaMaps({ layer: name, wrapX: false }) }),
        },
    );
}
const watercolor = createLayer('stamen_watercolor');
const toner = createLayer('stamen_toner');
const terrain = createLayer('stamen_terrain');

layersRemoved.push(watercolor);
layersRemoved.push(toner);
layersRemoved.push(terrain);

removeLayerButton.onclick = () => {
    if (layersAdded.length > 0) {
        const layer = layersAdded.pop();
        map.removeLayer(layer);
        layersRemoved.push(layer);
    }

    updateButtonStates();
};

addLayerButton.onclick = () => {
    if (layersRemoved.length > 0) {
        const layer = layersRemoved.pop();
        map.addLayer(layer);
        layersAdded.push(layer);
        updateButtonStates();
    }

    updateButtonStates();
};

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
