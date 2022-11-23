import TileWMS from 'ol/source/TileWMS.js';

import {
    AmbientLight, DirectionalLight, Vector3, Math as ThreeMath,
} from 'three';
import { IFCLoader } from 'three/examples/jsm/loaders/IFCLoader.js';

import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '@giro3d/giro3d/Core/Geographic/Extent.js';
import Instance from '@giro3d/giro3d/Core/Instance.js';
import ColorLayer from '@giro3d/giro3d/Core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/Core/layer/ElevationLayer.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/Core/layer/LayerUpdateStrategy.js';
import Coordinates from '@giro3d/giro3d/Core/Geographic/Coordinates.js';
import { ELEVATION_FORMAT } from '@giro3d/giro3d/utils/DEMUtils.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

// Defines projection that we will use (taken from https://epsg.io/3946, Proj4js section)
Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3946',
    1837816.94334, 1847692.32501,
    5170036.4587, 5178412.82698,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the giro3d instance
const instance = new Instance(viewerDiv);

// Adds lights for the IFC (as a Three object)
const lightColor = 0xffffff;

const ambientLight = new AmbientLight(lightColor, 0.5);
instance.scene.add(ambientLight);

const dirLight = new DirectionalLight(lightColor, 0.5);
dirLight.position.set(1, -1.75, 1);
instance.scene.add(dirLight);
dirLight.updateMatrixWorld();

// Adds the map that will contain the layers.
const map = new Map('planar', { extent });
instance.add(map);

// Adds a WMS imagery layer
const wmsSource = new TileWMS({
    url: 'https://download.data.grandlyon.com/wms/grandlyon',
    projection: 'EPSG:3946',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['Ortho2018_Dalle_unique_8cm_CC46'],
    },
    version: '1.3.0',
});

const colorLayer = new ColorLayer(
    'wms_imagery',
    {
        source: wmsSource,
        updateStrategy: {
            type: STRATEGY_DICHOTOMY,
            options: {},
        },
    },
);
map.addLayer(colorLayer);

// Adds a WMS elevation layer
const wmsSource2 = new TileWMS({
    url: 'https://download.data.grandlyon.com/wms/grandlyon',
    projection: 'EPSG:3946',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['MNT2018_Altitude_2m'],
    },
    version: '1.3.0',
});

const elevationLayer = new ElevationLayer(
    'wms_elevation',
    {
        source: wmsSource2,
        elevationFormat: ELEVATION_FORMAT.HEIGHFIELD,
        heightFieldOffset: 149, // Altitude corresponding to 0 in heightfield
        heightFieldScale: (621 - 149), // Altitude corresponding to 255 in heightfield
    },
);

map.addLayer(elevationLayer);

// Loads the IFC
const ifcPosition = {
    x: 1839610,
    y: 5173540,
    z: 276.8,
};

const ifcLoader = new IFCLoader();
let ifcModel;
ifcLoader.load(
    'data/AC20-FZK-Haus.ifc', // Found at https://www.ifcwiki.org/index.php?title=File:AC20-FZK-Haus.ifc
    _ifcModel => {
        ifcModel = _ifcModel;

        // Places the object
        ifcModel.translateY(ifcPosition.y)
            .translateX(ifcPosition.x)
            .translateZ(ifcPosition.z);

        // Swaps y and z axis
        ifcModel.lookAt(new Vector3(0, 0, 1));

        ifcModel.rotateY(ThreeMath.degToRad(-18));

        ifcModel.updateMatrixWorld();

        // Adds the object to the instance
        instance.add(ifcModel);
    },
    () => {},
    err => { console.error(err); },
);

// Sets the camera position
const cameraPosition = new Coordinates(
    'EPSG:3946',
    ifcPosition.x + 100, ifcPosition.y + 50, ifcPosition.z + 100,
).xyz();
instance.camera.camera3D.position.copy(cameraPosition);

// Creates controls
const controls = new MapControls(
    instance.camera.camera3D,
    viewerDiv,
);

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

// Then looks at the IFC object
controls.target = new Vector3(ifcPosition.x, ifcPosition.y, ifcPosition.z);
controls.saveState();

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

instance.domElement.addEventListener('dblclick', e => {
    const picked = instance.pickObjectsAt(e, {
        // Let the user pick only points from IFC model
        where: (document.getElementById('pick_source').value === '1') ? [ifcModel] : null,
    });
    if (picked.length === 0) {
        document.getElementById('selectedDiv').innerHTML = 'No object found';
    } else {
        document.getElementById('selectedDiv').innerHTML = `
${picked.length} objects found<br>
First object:
<ul>
<li>Point clicked: ${picked[0].point.x.toFixed(2)}, ${picked[0].point.y.toFixed(2)}, ${picked[0].point.z.toFixed(2)}</li>
<li>Distance to camera: ${picked[0].distance.toFixed(2)}</li>
</ul>
        `;
    }
});
