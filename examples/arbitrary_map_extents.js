import Stamen from 'ol/source/Stamen.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '@giro3d/giro3d/Core/Geographic/Extent.js';
import Instance from '@giro3d/giro3d/Core/Instance.js';
import ColorLayer from '@giro3d/giro3d/Core/layer/ColorLayer.js';
import { Map } from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import Helpers from '@giro3d/giro3d/helpers/Helpers.js';
import { Vector3, Object3D } from 'three';

// Defines geographic extent: CRS, min/max X, min/max Y
const EPSG3857_BOUNDS = new Extent(
    'EPSG:3857',
    -20037508.342789244, 20037508.342789244,
    -20037508.342789244, 20037508.342789244,
);

let currentMap;

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv, {
    crs: EPSG3857_BOUNDS.crs(),
    renderer: {
        clearColor: 0x0a3b59,
    },
});

// Instanciates controls
const controls = new MapControls(instance.camera.camera3D, viewerDiv);
instance.camera.camera3D.position.set(0, 0, 100000000);

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

instance.notifyChange();

const layers = ['watercolor', 'toner', 'terrain'];

let mapCount = 0;

// Create a grid that encompasses the whole EPSG:3857 bounds.
const grid = Helpers.createGrid(new Vector3(0, 0, 0), EPSG3857_BOUNDS.dimensions().x, 20);
instance.threeObjects.add(grid);

function createMap(extent) {
    if (currentMap) {
        instance.remove(currentMap);
        currentMap = null;
    }

    mapCount++;
    const object3d = new Object3D();
    // Creates a map that will contain the layer
    currentMap = new Map(`${mapCount}`, {
        extent,
        maxSubdivisionLevel: 10,
        object3d,
        showOutline: true,
    });

    currentMap.object3d.position.set(new Vector3(0, 0, mapCount * 10000));

    instance.add(currentMap);

    // Adds an TMS imagery layer
    const layer = layers[mapCount % layers.length];
    const stamenSource = new Stamen({ layer, wrapX: false });
    currentMap.addLayer(new ColorLayer(
        'osm',
        {
            source: stamenSource,
        },
    )).catch(e => console.error(e));

    instance.notifyChange();
}

const button = document.getElementById('createMap');

button.onclick = () => {
    const x0 = Math.random();
    const x1 = Math.random();
    const y0 = Math.random();
    const y1 = Math.random();

    const dimensions = EPSG3857_BOUNDS.dimensions();

    const west = EPSG3857_BOUNDS.west() + Math.min(x0, x1) * dimensions.x;
    const east = EPSG3857_BOUNDS.west() + Math.max(x0, x1) * dimensions.x;

    const north = EPSG3857_BOUNDS.south() + Math.max(y0, y1) * dimensions.y;
    const south = EPSG3857_BOUNDS.south() + Math.min(y0, y1) * dimensions.y;

    const extent = new Extent('EPSG:3857', west, east, south, north);

    createMap(extent);
};

instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));
