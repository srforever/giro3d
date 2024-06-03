import colormap from 'colormap';
import { Color, MathUtils, Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import Instance from '@giro3d/giro3d/core/Instance.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import PointCloudMaterial, { MODE } from '@giro3d/giro3d/renderer/PointCloudMaterial.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

import StatusBar from './widgets/StatusBar.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

function makeColorRamp(preset, nshades) {
    const values = colormap({ colormap: preset, nshades });
    const colors = values.map(v => new Color(v));

    return colors;
}

const colorRamps = {};

function makeColorRamps() {
    const nshades = 256;

    colorRamps.greys = makeColorRamp('greys', nshades);
    colorRamps.viridis = makeColorRamp('viridis', nshades);
    colorRamps.jet = makeColorRamp('jet', nshades);
    colorRamps.blackbody = makeColorRamp('blackbody', nshades);
    colorRamps.bathymetry = makeColorRamp('bathymetry', nshades);
    colorRamps.magma = makeColorRamp('magma', nshades);
    colorRamps.par = makeColorRamp('par', nshades);
}

makeColorRamps();

Instance.registerCRS(
    'EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 ' +
        '+y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, {
    crs: 'EPSG:3946',
    renderer: {
        clearColor: false, // To make canvas transparent
    },
});

// Enable point cloud post processing effects
instance.renderingOptions.enableEDL = true;
instance.renderingOptions.enableInpainting = true;
instance.renderingOptions.enablePointCloudOcclusion = true;

// Create a custom material for our point cloud.
const material = new PointCloudMaterial({ mode: MODE.INTENSITY });

material.colorMap.min = 0;
material.colorMap.max = 30;
material.colorMap.colors = colorRamps['greys'];

const url = 'https://3d.oslandia.com/giro3d/3d-tiles/lidarhd_intensity/tileset.json';

// Create the 3D tiles entity
const pointcloud = new Tiles3D('pointcloud', new Tiles3DSource(url), {
    material,
});

function placeCamera(position, lookAt) {
    instance.camera.camera3D.position.set(position.x, position.y, position.z);
    instance.camera.camera3D.lookAt(lookAt);
    // create controls
    const controls = new MapControls(instance.camera.camera3D, instance.domElement);
    controls.target.copy(lookAt);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;

    instance.useTHREEControls(controls);

    instance.notifyChange(instance.camera.camera3D);
}

const tmpVec3 = new Vector3();

// add pointcloud to scene
function initializeCamera() {
    const bbox = pointcloud.root.bbox
        ? pointcloud.root.bbox
        : pointcloud.root.boundingVolume.box.clone().applyMatrix4(pointcloud.root.matrixWorld);

    instance.camera.camera3D.far = 2.0 * bbox.getSize(tmpVec3).length();

    const ratio = bbox.getSize(tmpVec3).x / bbox.getSize(tmpVec3).z;
    const lookAt = bbox.getCenter(tmpVec3);
    lookAt.z = bbox.min.z;

    placeCamera(new Vector3(221965, 6873398, 1951), lookAt);

    StatusBar.bind(instance);
}

instance.add(pointcloud).then(initializeCamera);

Inspector.attach(document.getElementById('panelDiv'), instance);

function bindColorMapBounds(callback) {
    /** @type {HTMLInputElement} */
    const lower = document.getElementById('min');

    /** @type {HTMLInputElement} */
    const upper = document.getElementById('max');

    callback(lower.valueAsNumber, upper.valueAsNumber);

    function updateLabels() {
        document.getElementById('minLabel').innerText = `Lower bound: ${lower.valueAsNumber}`;
        document.getElementById('maxLabel').innerText = `Upper bound: ${upper.valueAsNumber}`;
    }

    lower.oninput = function oninput() {
        const rawValue = lower.valueAsNumber;
        const clampedValue = MathUtils.clamp(rawValue, lower.min, upper.valueAsNumber - 1);
        lower.valueAsNumber = clampedValue;
        callback(lower.valueAsNumber, upper.valueAsNumber);
        instance.notifyChange();
        updateLabels();
    };

    upper.oninput = function oninput() {
        const rawValue = upper.valueAsNumber;
        const clampedValue = MathUtils.clamp(rawValue, lower.valueAsNumber + 1, upper.max);
        upper.valueAsNumber = clampedValue;
        callback(lower.valueAsNumber, upper.valueAsNumber);
        instance.notifyChange();
        updateLabels();
    };
}

bindColorMapBounds((min, max) => {
    material.colorMap.min = min;
    material.colorMap.max = max;
});

document.getElementById('colormap').addEventListener('change', e => {
    const newRamp = e.target.value;
    material.colorMap.colors = colorRamps[newRamp];
    instance.notifyChange(pointcloud, true);
});

const labelElement = document.createElement('div');
labelElement.classList = 'badge rounded-pill text-bg-light';
labelElement.style.marginTop = '2rem';

const intensityValue = document.createElement('span');
intensityValue.style.marginLeft = '0.5rem';

const intensityColor = document.createElement('span');
intensityColor.classList = 'badge rounded-pill';
intensityColor.style.color = 'white';
intensityColor.style.background = 'red';
intensityColor.style.width = '1rem';
intensityColor.innerText = ' ';

labelElement.appendChild(intensityColor);
labelElement.appendChild(intensityValue);

const label = new CSS2DObject(labelElement);

instance.add(label);

// Let's query the intensity of the picked point and display it in the label.
function updateLabel(mouseEvent) {
    const results = instance.pickObjectsAt(mouseEvent, { radius: 6 });

    // Reset label visibility
    label.visible = false;

    if (results && results.length > 0) {
        for (const result of results) {
            const { object, point, index } = result;

            const intensity = object.getIntensity(index);

            if (intensity) {
                const color = material.colorMap.sample(intensity);

                const hex = color.getHexString();
                intensityColor.style.background = `#${hex}`;

                intensityValue.innerText = `${intensity.toFixed(2)}`;

                label.visible = true;
                label.position.copy(point);
                label.updateMatrixWorld(true);

                break;
            }
        }
    }

    instance.notifyChange();
}

instance.domElement.addEventListener('mousemove', updateLabel);
