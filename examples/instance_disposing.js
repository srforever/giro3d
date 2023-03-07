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
const dimensions = extent.dimensions();

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

let instance = null;
let inspector = null;
let controls = null;

const stamenSource = new Stamen({ layer: 'watercolor', wrapX: false });
function init() {
    // Creates a giro3d instance
    instance = new Instance(viewerDiv, {
        crs: extent.crs(),
        renderer: {
            clearColor: 0x0a3b59,
        },
    });

    // Creates a map that will contain the layer
    const map = new Map('planar', { extent, maxSubdivisionLevel: 10 });

    instance.add(map);

    // Adds an TMS imagery layer
    map.addLayer(new ColorLayer(
        'osm',
        {
            source: stamenSource,
        },
    )).catch(e => console.error(e));

    // Instanciates camera
    instance.camera.camera3D.position.set(
        (Math.random() - 0.5) * dimensions.x,
        (Math.random() - 0.5) * dimensions.y,
        25000000,
    );

    // Instanciates controls
    controls = new MapControls(instance.camera.camera3D, viewerDiv);

    instance.useTHREEControls(controls);

    inspector = Inspector.attach(document.getElementById('panelDiv'), instance);
}

init();

function reload() {
    if (!instance) return;

    inspector.detach();
    instance.dispose();
    controls.dispose();
    inspector = null;
    instance = null;
    controls = null;
    init();
}

document.getElementById('load_once').addEventListener('click', reload);

// we need to get the current state of the checkbox, as browsers remembers it
let intervalId;
const autoreloadCheckbox = document.getElementById('autoreload');
if (autoreloadCheckbox.checked) {
    intervalId = setInterval(reload, 2000);
}
autoreloadCheckbox.addEventListener('change', e => {
    if (intervalId) {
        clearInterval(intervalId);
    }
    if (e.target.checked) {
        intervalId = setInterval(reload, 2000);
    }
});
