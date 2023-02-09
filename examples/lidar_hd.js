import {
    Vector3, CubeTextureLoader,
} from 'three';
import TileWMS from 'ol/source/TileWMS.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/core/layer/LayerUpdateStrategy.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

const tmpVec3 = new Vector3();

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, { crs: 'EPSG:2154' });

// Creates controls
const controls = new MapControls(
    instance.camera.camera3D,
    viewerDiv,
);
controls.enableDamping = true;
controls.dampingFactor = 0.2;

instance.useTHREEControls(controls);

// Adds a WMS imagery layer
const wmsOthophotoSource = new TileWMS({
    url: 'https://wxs.ign.fr/ortho/geoportail/r/wms',
    projection: 'EPSG:2154',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['HR.ORTHOIMAGERY.ORTHOPHOTOS'],
        FORMAT: 'image/jpeg',
    },
    version: '1.3.0',
});

const colorLayer = new ColorLayer(
    'orthophoto-ign',
    {
        source: wmsOthophotoSource,
        updateStrategy: {
            type: STRATEGY_DICHOTOMY,
            options: {},
        },
    },
);

const pointcloud = new Tiles3D(
    'pointcloud',
    new Tiles3DSource('https://3d.oslandia.com/lidar_hd/tileset.json'),
);
// add pointcloud to scene
function initializeCameraPosition(layer) {
    const bbox = layer.root.bbox
        ? layer.root.bbox
        : layer.root.boundingVolume.box.clone().applyMatrix4(layer.root.matrixWorld);

    // configure camera
    instance.camera.camera3D.far = 2.0 * bbox.getSize(tmpVec3).length();

    const ratio = bbox.getSize(tmpVec3).x / bbox.getSize(tmpVec3).z;
    const position = bbox.min.clone().add(
        bbox.getSize(tmpVec3).multiply({ x: 0, y: 0, z: ratio * 0.5 }),
    );
    const lookAt = bbox.getCenter(tmpVec3);
    lookAt.z = bbox.min.z;
    instance.camera.camera3D.position.set(position.x, position.y, position.z);
    instance.camera.camera3D.lookAt(lookAt);
    controls.target.copy(lookAt);
    controls.saveState();

    // refresh scene
    instance.notifyChange(instance.camera.camera3D);
}
instance.add(pointcloud).then(initializeCameraPosition);
pointcloud.attach(colorLayer);

// add a skybox background
const cubeTextureLoader = new CubeTextureLoader();
cubeTextureLoader.setPath('image/skyboxsun25deg_zup/');
const cubeTexture = cubeTextureLoader.load([
    'px.jpg', 'nx.jpg',
    'py.jpg', 'ny.jpg',
    'pz.jpg', 'nz.jpg',
]);

instance.scene.background = cubeTexture;

Inspector.attach(document.getElementById('panelDiv'), instance);

// Bind events
const infoDiv = document.getElementById('infoDiv');
instance.domElement.addEventListener('mousemove', e => {
    const picked = instance.pickObjectsAt(e, { radius: 5, limit: 1, where: [pointcloud] }).at(0);
    if (picked) {
        infoDiv.classList.remove('d-none');
        infoDiv.textContent = `x: ${picked.point.x.toFixed(2)}, y: ${picked.point.y.toFixed(2)}, z: ${picked.point.z.toFixed(5)}`;
    } else {
        infoDiv.classList.add('d-none');
    }
});
