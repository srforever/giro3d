import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

import StatusBar from './widgets/StatusBar.js';

const viewerDiv = document.getElementById('viewerDiv');

Instance.registerCRS(
    'EPSG:2154',
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
);

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

instance.add(pointcloud).then(() => {
    instance.focusObject(pointcloud)
    StatusBar.bind(instance);
});

// create controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

const resultsTable = document.getElementById('results-body');
const formatter = new Intl.NumberFormat();

function format(point) {
    return `x: ${formatter.format(point.x)}\n
            y: ${formatter.format(point.y)}\n
            z: ${formatter.format(point.z)}`;
}

instance.domElement.addEventListener('dblclick', e => {
    const picked = instance.pickObjectsAt(e, { radius: 5, limit: 10, where: ['pointcloud'] });

    if (picked.length === 0) {
        const row = document.createElement('tr');
        const count = document.createElement('th');
        count.setAttribute('scope', 'row');
        count.innerText = '-';
        const coordinates = document.createElement('td');
        coordinates.innerText = '-';
        const distanceToCamera = document.createElement('td');
        distanceToCamera.innerText = '-';
        row.append(count, coordinates, distanceToCamera);
        resultsTable.replaceChildren(row);
    } else {
        const rows = picked.map((p, i) => {
            const row = document.createElement('tr');
            const count = document.createElement('th');
            count.setAttribute('scope', 'row');
            count.innerText = `${i + 1}`;
            const coordinates = document.createElement('td');
            coordinates.innerHTML = format(p.point);
            const distanceToCamera = document.createElement('td');
            distanceToCamera.innerText = formatter.format(p.distance);
            row.append(count, coordinates, distanceToCamera);
            return row;
        });
        resultsTable.replaceChildren(...rows);
    }
});
