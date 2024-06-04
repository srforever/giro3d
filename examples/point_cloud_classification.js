import { Color } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import Instance from '@giro3d/giro3d/core/Instance.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import PointCloudMaterial, { MODE } from '@giro3d/giro3d/renderer/PointCloudMaterial.js';

import StatusBar from './widgets/StatusBar.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS(
    'EPSG:2154',
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
);

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, {
    crs: 'EPSG:2154',
    renderer: {
        clearColor: false, // To make the canvas transparent and show the actual CSS background
    },
});

// Enables post-processing effects to improve readability of point cloud.
instance.renderingOptions.enableEDL = true;
instance.renderingOptions.enableInpainting = true;
instance.renderingOptions.enablePointCloudOcclusion = true;

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.2;

instance.camera.camera3D.position.set(227137, 6876151, 128);
controls.target.set(227423, 6876442, 0);

controls.saveState();

instance.useTHREEControls(controls);

// We create a PointCloudMaterial in CLASSIFICATION
// mode to display the point classifications.
const material = new PointCloudMaterial({ mode: MODE.CLASSIFICATION });

// The material provides default colors for classifications 0-63,
// i.e the reserved range for ASPRS classifications.
// Classifications in the 64-255 range are user-defined.

material.classifications[64].color = new Color(0x94a770); // Classification "Sursol pérenne"
material.classifications[65].color = new Color(0xd3ff00); // Classification "Artefacts"
material.classifications[66].color = new Color(0x00ff8d); // Classification "Points virtuels"

// Original dataset extracted from the French IGN LIDAR HD
// database (https://geoservices.ign.fr/lidarhd#telechargementclassifiees),
// then converted to 3D Tiles with py3dtiles (https://gitlab.com/py3dtiles/py3dtiles)
const url =
    'https://3d.oslandia.com/giro3d/3d-tiles/LHD_FXX_0227_6877_PTS_C_LAMB93_IGN69/tileset.json';

const pointcloud = new Tiles3D('pointcloud', new Tiles3DSource(url), {
    material,
});

// add pointcloud to scene
instance.add(pointcloud);

Inspector.attach(document.getElementById('panelDiv'), instance);

// Bind events
StatusBar.bind(instance);

const classificationNames = new Array(32);

// GUI controls for classification handling

function addClassification(number, name) {
    const currentColor = material.classifications[number].color.getHexString();

    const template = `
    <div class="form-check form-switch">
        <input
            class="form-check-input"
            type="checkbox"
            checked
            role="switch"
            id="class-${number}"
            autocomplete="off"
        />
        <label class="form-check-label w-100" for="class-${number}">
            <div class="row">
                <div class="col" >${name}</div>
                <div class="col-auto">
                    <input
                        type="color"
                        style="height: 1.5rem"
                        class="form-control form-control-color float-end"
                        id="color-${number}"
                        value="#${currentColor}"
                        title="Classification color"
                    />
                </div>
            </div>
        </label>
    </div>
    `;

    const node = document.createElement('div');
    node.innerHTML = template;
    document.getElementById('classifications').appendChild(node);

    const colorPicker = document.getElementById(`color-${number}`);

    colorPicker.oninput = function oninput() {
        // Let's change the classification color with the color picker value
        const hexColor = colorPicker.value;

        // Parse it into a THREE.js color
        const color = new Color(hexColor);

        material.classifications[number].color = color;

        instance.notifyChange();
    };

    classificationNames[number] = name;

    const toggle = document.getElementById(`class-${number}`);

    toggle.oninput = function oninput() {
        // By toggling the .visible property of a classification,
        // all points that have this classification are hidden/shown.
        material.classifications[number].visible = toggle.checked;
        instance.notifyChange();
    };
}

// Standard ASPRS classifications found in the dataset
addClassification(1, 'Unclassified');
addClassification(2, 'Ground');
addClassification(3, 'Low vegetation');
addClassification(4, 'Medium vegetation');
addClassification(5, 'High vegetation');
addClassification(6, 'Building');
addClassification(9, 'Water');

// Dataset-specific classifications
addClassification(64, 'Permanent above-ground structures');
addClassification(65, 'Artifacts');
addClassification(67, 'Virtual points');

const labelElement = document.createElement('div');
labelElement.classList = 'badge rounded-pill text-bg-light';
labelElement.style.marginTop = '2rem';

const classifName = document.createElement('span');
classifName.style.marginLeft = '0.5rem';

const classifColor = document.createElement('span');
classifColor.classList = 'badge rounded-pill';
classifColor.style.color = 'white';
classifColor.style.background = 'red';
classifColor.style.width = '1rem';
classifColor.innerText = ' ';

labelElement.appendChild(classifColor);
labelElement.appendChild(classifName);

const label = new CSS2DObject(labelElement);

instance.add(label);

// Let's query the classification of the picked point and display it in the label.
function updateLabel(mouseEvent) {
    const results = instance.pickObjectsAt(mouseEvent, { radius: 6 });

    // Reset label visibility
    label.visible = false;

    if (results && results.length > 0) {
        for (const result of results) {
            const { object, point, index } = result;

            const classificationIndex = object.getClassification(index);

            const classification = material.classifications[classificationIndex];

            // Let's ignore hidden classifications
            if (classification && classification.visible) {
                const color = classification.color.getHexString();
                classifColor.style.background = `#${color}`;

                classifName.innerText = classificationNames[classificationIndex];

                label.visible = true;
                label.position.copy(point);
                label.updateMatrixWorld(true);

                break;
            }
        }
    }

    instance.notifyChange();
}

function bindSlider(name, callback) {
    const slider = document.getElementById(name);
    slider.oninput = function oninput() {
        callback(slider.valueAsNumber);
        instance.notifyChange(pointcloud);
    };
}

bindSlider('pointSize', v => {
    material.size = v;
});

function bindToggle(name, callback) {
    const toggle = document.getElementById(name);
    toggle.oninput = () => {
        const state = toggle.checked;
        callback(state);
        instance.notifyChange(pointcloud);
    };
}

bindToggle('postProcessingEffects', v => {
    instance.renderingOptions.enableEDL = v;
    instance.renderingOptions.enableInpainting = v;
    instance.renderingOptions.enablePointCloudOcclusion = v;
});

instance.domElement.addEventListener('mousemove', updateLabel);
