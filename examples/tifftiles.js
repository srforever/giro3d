import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import XYZ from 'ol/source/XYZ.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import Interpretation from '@giro3d/giro3d/core/layer/Interpretation.js';
import GeoTIFFFormat from '@giro3d/giro3d/formats/GeoTIFFFormat.js';

const x = -13602618.385789588;
const y = 5811042.273912458;

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    x - 12000, x + 13000,
    y - 4000, y + 21000,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x0a3b59,
    },
});

// Creates a map that will contain the layer
const map = new Map('planar', {
    extent,
    hillshading: true,
    segments: 64,
    discardNoData: true,
    backgroundColor: 'white',
});

instance.add(map);

// Adds an TMS imagery layer
const tmsSource = new XYZ({
    attributions: '',
    minZoom: 0,
    maxZoom: 15,
    url: 'https://3d.oslandia.com/dem/tiles/{z}/{x}/{-y}-f32.tif',
    tileSize: [256, 256],
});

// Specifies the image format (necessary for for non JPG/PNG images).
tmsSource.format = new GeoTIFFFormat();

map.addLayer(new ElevationLayer(
    'osm',
    {
        interpretation: Interpretation.Raw,
        source: tmsSource,
    },
)).catch(e => console.error(e));

const center = extent.center().xyz();
instance.camera.camera3D.position.set(center.x, center.y, 25000);

// Instanciates controls
const controls = new MapControls(instance.camera.camera3D, viewerDiv);

controls.target.copy(center);

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

// Bind events
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));
const infoDiv = document.getElementById('infoDiv');
instance.domElement.addEventListener('mousemove', e => {
    const picked = instance.pickObjectsAt(e, { limit: 1 }).at(0);
    if (picked) {
        infoDiv.classList.remove('d-none');
        infoDiv.textContent = `x: ${picked.point.x.toFixed(2)}, y: ${picked.point.y.toFixed(2)}, z: ${picked.point.z.toFixed(0)}`;
    } else {
        infoDiv.classList.add('d-none');
    }
});
