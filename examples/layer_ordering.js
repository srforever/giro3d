import Stamen from 'ol/source/Stamen.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/gui/Inspector.js';
import StatusBar from './widgets/StatusBar.js';

const crs = 'EPSG:3857';
const mapExtent = Extent.fromCenterAndSize(crs, { x: 256227, y: 5882214 }, 2000000, 2000000);
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv);

// Instanciates camera
instance.camera.camera3D.position.set(256227, 5882214, 4000000);

const map = new Map('planar', { extent: mapExtent, backgroundOpacity: 0 });
instance.add(map);

const layerSize = 1000000;

const watercolor = new ColorLayer(
    'watercolor',
    {
        extent: Extent.fromCenterAndSize(crs, { x: -100000, y: 6169226 }, layerSize, layerSize),
        source: new Stamen({ layer: 'watercolor', wrapX: false }),
    },
);

const toner = new ColorLayer(
    'toner',
    {
        extent: Extent.fromCenterAndSize(crs, { x: 500000, y: 5669226 }, layerSize, layerSize),
        source: new Stamen({ layer: 'toner', wrapX: false }),
    },
);

const terrain = new ColorLayer(
    'terrain',
    {
        extent: Extent.fromCenterAndSize(crs, { x: 900000, y: 5169226 }, layerSize, layerSize),
        source: new Stamen({ layer: 'terrain', wrapX: false }),
    },
);

map.addLayer(watercolor);
map.addLayer(toner);
map.addLayer(terrain);

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);

const layers = {
    watercolor,
    toner,
    terrain,
};

function bindUI(layer) {
    const id = layer.id;
    const btnUp = document.getElementById(`btn-${id}-up`);
    const btnDown = document.getElementById(`btn-${id}-down`);
    const layerElt = document.getElementById(`${id}`);
    layerElt.layer = layer;
    const container = layerElt.parentNode;

    function reorder() {
        [...container.children]
            .sort((a, b) => (map.getIndex(layers[a.id]) > map.getIndex(layers[b.id]) ? -1 : 1))
            .forEach(node => container.appendChild(node));
    }

    btnUp.onclick = () => { map.moveLayerUp(layer); reorder(); };
    btnDown.onclick = () => { map.moveLayerDown(layer); reorder(); };

    reorder();
}

bindUI(watercolor);
bindUI(toner);
bindUI(terrain);
