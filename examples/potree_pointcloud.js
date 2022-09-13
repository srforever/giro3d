import { Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Instance from '@giro3d/giro3d/Core/Instance.js';
import PotreePointCloud from '@giro3d/giro3d/entities/PotreePointCloud.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import PotreeSource from '@giro3d/giro3d/sources/PotreeSource.js';

const viewerDiv = document.getElementById('viewerDiv');

const source = new PotreeSource(
    'https://3d.oslandia.com/potree/pointclouds/lion_takanawa',
    'cloud.js',
);

const potree = new PotreePointCloud('potree', source);

const instance = new Instance(viewerDiv);

function placeCamera() {
    const camera = instance.camera.camera3D;

    // create controls
    const controls = new OrbitControls(
        camera,
        instance.domElement,
    );
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;

    const pos = new Vector3(
        6.757520397934977,
        -10.102934086721376,
        7.402449241148831,
    );

    const lookAt = new Vector3(0.5, 0.5, 5);

    camera.lookAt(lookAt);
    controls.target.copy(lookAt);
    camera.position.copy(pos);

    instance.useTHREEControls(controls);
}

instance.add(potree).then(placeCamera);
instance.notifyChange(instance.camera.camera3D);

Inspector.attach(document.getElementById('panelDiv'), instance);
