import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    Mesh,
    Vector3,
    Euler,
    MeshBasicMaterial,
    BoxGeometry,
    Object3D,
} from 'three';
import TileWMS from 'ol/source/TileWMS.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/core/layer/LayerUpdateStrategy.js';
import Interpretation from '@giro3d/giro3d/core/layer/Interpretation.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

// # Planar (EPSG:3946) viewer

const wmsLayers = [
    'fpc_fond_plan_communaut.fpcilot',
    'pvo_patrimoine_voirie.pvochausseetrottoir',
    'Ortho2009_vue_ensemble_16cm_CC46',
    'pos_opposable.poshauvoi',
    'MNT2015_Ombrage_2m',
    'cad_cadastre.cadilot',
];

const cubeTransformations = [
    {
        position: new Vector3(0, 0, 0.5),
        rotation: new Euler(),
    },
    {
        position: new Vector3(0, 0, -0.5),
        rotation: new Euler().set(Math.PI, 0, 0),
    },
    {
        position: new Vector3(0, 0.5, 0),
        rotation: new Euler().set(-Math.PI * 0.5, 0, 0),
    },
    {
        position: new Vector3(0, -0.5, 0),
        rotation: new Euler().set(Math.PI * 0.5, 0, 0),
    },
    {
        position: new Vector3(0.5, 0, 0),
        rotation: new Euler().set(0, Math.PI * 0.5, 0),
    },
    {
        position: new Vector3(-0.5, 0, 0),
        rotation: new Euler().set(0, -Math.PI * 0.5, 0),
    },
];

// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Define geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3946',
    1837900, 1837900 + 8000,
    5170100, 5170100 + 8000,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

const scale = new Vector3(1, 1, 1).divideScalar(extent.dimensions().x);

// Instantiate giro3d
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x999999,
    },
});

const cube = new Mesh(
    new BoxGeometry(8000, 8000, 8000),
    new MeshBasicMaterial({ color: 0xdddddd }),
);
cube.scale.copy(scale);
cube.updateMatrixWorld(true);

instance.scene.add(cube);

function createColorLayer(name, url) {
    const colorSource = new TileWMS({
        url,
        params: {
            LAYERS: name,
        },
        projection: 'EPSG:3946',
        crossOrigin: 'anonymous',
        version: '1.3.0',
    });

    return new ColorLayer(
        'wms_imagery',
        {
            imageSize: { w: 256, h: 256 },
            source: colorSource,
            updateStrategy: {
                type: STRATEGY_DICHOTOMY,
                options: {},
            },
        },
    );
}

function createElevationLayer(name, url) {
    const wmsSource2 = new TileWMS({
        url,
        projection: 'EPSG:3946',
        crossOrigin: 'anonymous',
        params: {
            LAYERS: [name],
        },
        version: '1.3.0',
    });

    return new ElevationLayer(
        'wms_elevation',
        {
            source: wmsSource2,
            interpretation: Interpretation.ScaleToMinMax(149, 621),
        },
    );
}

for (let i = 0; i < wmsLayers.length; i++) {
    const cubeSide = new Object3D();
    const offset = extent.center().xyz().negate().applyEuler(cubeTransformations[i].rotation);
    offset.add(cubeTransformations[i].position.divide(scale));
    cubeSide.position.copy(offset);
    cubeSide.rotation.copy(cubeTransformations[i].rotation);
    cube.add(cubeSide);
    cubeSide.updateMatrixWorld(true);

    const wms = wmsLayers[i];
    const map = new Map(`planar${wms}${i}`, { extent, object3d: cubeSide, maxSubdivisionLevel: 2 });
    instance.add(map);

    map.addLayer(createColorLayer(wms, 'https://download.data.grandlyon.com/wms/grandlyon'));
    map.addLayer(createElevationLayer('MNT2012_Altitude_10m_CC46', 'https://download.data.grandlyon.com/wms/grandlyon'));
}

instance.camera.camera3D.position.set(3, 2, 3);
instance.camera.camera3D.updateMatrixWorld(true);
instance.camera.camera3D.lookAt(new Vector3(0, 0, 0));

const controls = new OrbitControls(instance.camera.camera3D, viewerDiv);
controls.minDistance = 1;

instance.useTHREEControls(controls);

// Request redraw
instance.notifyChange();

Inspector.attach(document.getElementById('panelDiv'), instance);
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));
