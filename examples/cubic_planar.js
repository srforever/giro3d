import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    Mesh,
    Vector3,
    Euler,
    MeshBasicMaterial,
    BoxGeometry,
    Object3D,
} from 'three';
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import TileWMS from 'ol/source/TileWMS.js';
import Extent from '../src/Core/Geographic/Extent.js';
import Instance from '../src/Core/Instance.js';
import ColorLayer from '../src/Core/layer/ColorLayer.js';
import ElevationLayer from '../src/Core/layer/ElevationLayer.js';
import { STRATEGY_DICHOTOMY } from '../src/Core/layer/LayerUpdateStrategy.js';
import { ELEVATION_FORMAT } from '../src/utils/DEMUtils.js';
import { Map } from '../src/entities/Map.js';

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
proj4.defs('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
register(proj4);

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
const instance = new Instance(viewerDiv, extent);

instance.mainLoop.gfxEngine.renderer.setClearColor(0x999999);

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
            elevationFormat: ELEVATION_FORMAT.HEIGHFIELD,
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
    map.disableSkirt = true;
    instance.add(map);

    map.addLayer(createColorLayer(wms, 'https://download.data.grandlyon.com/wms/grandlyon'));
    map.addLayer(createElevationLayer('MNT2012_Altitude_10m_CC46', 'https://download.data.grandlyon.com/wms/grandlyon'));

    // Since the elevation layer use color textures, specify min/max z
    map.materialOptions = {
        useColorTextureElevation: true,
        colorTextureElevationMinZ: -600,
        colorTextureElevationMaxZ: 400,
    };
}

const camera = instance.camera.camera3D;
camera.position.set(3, 2, 3);
camera.updateMatrixWorld(true);
camera.lookAt(new Vector3(0, 0, 0));

const controls = new OrbitControls(camera, viewerDiv);
controls.minDistance = 1;

instance.useTHREEControls(controls);

// Request redraw
instance.notifyChange();
