import { Vector3 } from 'three';
import TileWMS from 'ol/source/TileWMS.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Instance from '@giro3d/giro3d/Core/Instance.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/Core/layer/LayerUpdateStrategy.js';
import ColorLayer from '@giro3d/giro3d/Core/layer/ColorLayer.js';
import PointsMaterial, { MODE } from '@giro3d/giro3d/Renderer/PointsMaterial.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

const tmpVec3 = new Vector3();

Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 '
    + '+y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, {
    crs: 'EPSG:3946',
    renderer: {
        clearColor: 0xcccccc,
    },
});

// Create a custom material for our point cloud.
const material = new PointsMaterial({
    size: 4,
    mode: MODE.TEXTURE,
});

// Create the 3D tiles entity
const pointcloud = new Tiles3D(
    'pointcloud',
    new Tiles3DSource('https://3d.oslandia.com/3dtiles/lyon.3dtiles/tileset.json'),
    {
        material,
    },
);

document.getElementById('pointcloud_mode').addEventListener('change', e => {
    const newMode = parseInt(e.target.value, 10);
    material.mode = newMode;
    instance.notifyChange(pointcloud, true);
});

function placeCamera(position, lookAt) {
    instance.camera.camera3D.position.set(position.x, position.y, position.z);
    instance.camera.camera3D.lookAt(lookAt);
    // create controls
    const controls = new MapControls(
        instance.camera.camera3D,
        instance.domElement,
    );
    controls.target.copy(lookAt);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;

    instance.useTHREEControls(controls);

    instance.notifyChange(instance.camera.camera3D);
}

// add pointcloud to scene
function initializeCamera() {
    const bbox = pointcloud.root.bbox
        ? pointcloud.root.bbox
        : pointcloud.root.boundingVolume.box.clone().applyMatrix4(pointcloud.root.matrixWorld);

    instance.camera.camera3D.far = 2.0 * bbox.getSize(tmpVec3).length();

    const ratio = bbox.getSize(tmpVec3).x / bbox.getSize(tmpVec3).z;
    const position = bbox.min.clone().add(
        bbox.getSize(tmpVec3).multiply({ x: 0, y: 0, z: ratio * 0.5 }),
    );
    const lookAt = bbox.getCenter(tmpVec3);
    lookAt.z = bbox.min.z;

    placeCamera(position, lookAt);

    const colorize = new TileWMS({
        url: 'https://download.data.grandlyon.com/wms/grandlyon',
        params: {
            LAYERS: 'Ortho2009_vue_ensemble_16cm_CC46',
        },
        projection: 'EPSG:3946',
        crossOrigin: 'anonymous',
        version: '1.3.0',
    });

    const colorLayer = new ColorLayer(
        'wms_imagery',
        {
            source: colorize,
            updateStrategy: {
                type: STRATEGY_DICHOTOMY,
                options: {},
            },
        },
    );

    pointcloud.attach(colorLayer);
}

instance.add(pointcloud).then(initializeCamera);

Inspector.attach(document.getElementById('panelDiv'), instance);
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e, { radius: 5 })));
