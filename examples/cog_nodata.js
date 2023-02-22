import colormap from 'colormap';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Color } from 'three';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import CogSource from '@giro3d/giro3d/sources/CogSource.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import ColorMap, { ColorMapMode } from '@giro3d/giro3d/core/layer/ColorMap.js';

// Define projection that we will use (taken from https://epsg.io/6345, Proj4js section)
Instance.registerCRS('EPSG:6345', '+proj=utm +zone=16 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
const extent = new Extent(
    'EPSG:6345',
    583500, 584762,
    3280500, 3282000,
);

const center = extent.center().xyz();

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Instantiate Giro3D
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x0a3b59,
    },
});

// Instantiate the camera
instance.camera.camera3D.position.set(center.x, center.y - 1, 3000);

// Instantiate the controls
const controls = new MapControls(
    instance.camera.camera3D,
    viewerDiv,
);
controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.target.set(center.x, center.y, center.z);
instance.useTHREEControls(controls);

// Construct a map and add it to the instance
const map = new Map('planar', {
    extent,
    discardNoData: true,
    backgroundColor: new Color(0, 0, 0),
    hillshading: true,
});
instance.add(map);

// Use an elevation COG with nodata values
const source = new CogSource({
    // https://www.sciencebase.gov/catalog/item/624d95e3d34e21f827660b53
    url: 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/OPR/Projects/LA_Chenier_Plain_Lidar_2017_B16/LA_Chenier_Plain_2017/TIFF/USGS_OPR_LA_Chenier_Plain_Lidar_2017_B16_15RWN835805.tif',
});

const values = colormap({ colormap: 'greys' });
const colors = values.map(v => new Color(v));

const min = -0.2;
const max = 1.3;

// Display it as elevation and color
const colorMap = new ColorMap(colors, min, max, ColorMapMode.Elevation);
map.addLayer(new ElevationLayer('elevation', { source, colorMap, minmax: { min, max } }));

// Attach the inspector
Inspector.attach(document.getElementById('panelDiv'), instance);

// Bind events
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));
const infoDiv = document.getElementById('infoDiv');
instance.domElement.addEventListener('mousemove', e => {
    const picked = instance.pickObjectsAt(e, { limit: 1 }).at(0);
    if (picked) {
        infoDiv.classList.remove('d-none');
        infoDiv.textContent = `x: ${picked.point.x.toFixed(2)}, y: ${picked.point.y.toFixed(2)}, z: ${picked.point.z.toFixed(5)}`;
    } else {
        infoDiv.classList.add('d-none');
    }
});
