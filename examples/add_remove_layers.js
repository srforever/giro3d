import Stamen from 'ol/source/Stamen.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

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
const controls = new MapControls(instance.camera.camera3D, viewerDiv);

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

const watercolor = new ColorLayer(
    'watercolor',
    {
        source: new Stamen({ layer: 'watercolor', wrapX: false }),
    },
);

const toner = new ColorLayer(
    'toner',
    {
        source: new Stamen({ layer: 'toner', wrapX: false }),
    },
);

const terrain = new ColorLayer(
    'terrain',
    {
        source: new Stamen({ layer: 'terrain', wrapX: false }),
    },
);

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
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));
