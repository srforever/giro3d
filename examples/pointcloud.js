import { Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Instance from '@giro3d/giro3d/Core/Instance.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

const tmpVec3 = new Vector3();

const viewerDiv = document.getElementById('viewerDiv');

Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

const instance = new Instance(viewerDiv, {
    crs: 'EPSG:2154',
    renderer: {
        clearColor: 0xcccccc,
    },
});

// Configure Point Cloud
const pointcloud = new Tiles3D(
    'pointcloud',
    new Tiles3DSource('https://3d.oslandia.com/3dtiles/eglise_saint_blaise_arles/tileset.json'),
);

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
}

instance.add(pointcloud).then(initializeCamera);

Inspector.attach(document.getElementById('panelDiv'), instance);

// Bind events
instance.domElement.addEventListener('dblclick', e => {
    const picked = instance.pickObjectsAt(e, { radius: 5, limit: 10, where: ['pointcloud'] });
    console.log(picked);
    if (picked.length === 0) {
        document.getElementById('selectedDiv').innerHTML = 'No object found';
    } else {
        document.getElementById('selectedDiv').innerHTML = `
${picked.length} objects found<br>
<ol>
    ${picked.map(p => `<li>${p.point.x.toFixed(2)}, ${p.point.y.toFixed(2)}, ${p.point.z.toFixed(2)} (distance: ${p.distance.toFixed(2)})</li>`).join('')}
</ol>
        `;
    }
});

const infoDiv = document.getElementById('infoDiv');
instance.domElement.addEventListener('mousemove', e => {
    const picked = instance.pickObjectsAt(e, { radius: 5, limit: 1 }).at(0);
    if (picked) {
        infoDiv.classList.remove('d-none');
        infoDiv.textContent = `x: ${picked.point.x.toFixed(2)}, y: ${picked.point.y.toFixed(2)}, z: ${picked.point.z.toFixed(2)}`;
    } else {
        infoDiv.classList.add('d-none');
    }
});
