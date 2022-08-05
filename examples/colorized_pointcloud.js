import proj4 from 'proj4';
import { Group, PointsMaterial, Vector3 } from 'three';
import TileWMS from 'ol/source/TileWMS.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Instance from '../src/Core/Instance.js';
import Entity3D from '../src/entities/Entity3D.js';
import { STRATEGY_DICHOTOMY } from '../src/Core/layer/LayerUpdateStrategy.js';
import ColorLayer from '../src/Core/layer/ColorLayer.js';

const tmpVec3 = new Vector3();

const viewerDiv = document.getElementById('viewerDiv');
viewerDiv.style.display = 'block';

proj4.defs('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 '
        + '+y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

const instance = new Instance(viewerDiv, {
    crs: 'EPSG:3946',
    renderer: {
        clearColor: 0xcccccc,
    },
});

// Configure Point Cloud
const pointcloud = new Entity3D('pointcloud', new Group());
pointcloud.file = 'https://3d.oslandia.com/3dtiles/lyon.3dtiles/tileset.json';
pointcloud.protocol = '3d-tiles';
pointcloud.url = 'https://3d.oslandia.com/3dtiles/lyon.3dtiles/tileset.json';
pointcloud.material = new PointsMaterial({
    sizeAttenuation: false,
    size: 1,
    vertexColors: true,
});

function placeCamera(position, lookAt) {
    instance.camera.camera3D.position.set(position.x, position.y, position.z);
    instance.camera.camera3D.lookAt(lookAt);
    // create controls
    const controls = new MapControls(
        instance.camera.camera3D,
        instance.mainLoop.gfxEngine.renderer.domElement,
    );
    controls.target.copy(lookAt);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;

    instance.addFrameRequester('before_camera_update', () => {
        controls.update();
    });
    controls.addEventListener('change', () => {
        instance.notifyChange(instance.camera.camera3D);
    });

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
            imageSize: { w: 256, h: 256 },
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
