import { Vector3 } from 'three';
import Instance from '@giro3d/giro3d/core/Instance.js';

const VIEW_PARAM = 'view';

function processUrl(instance, url) {
    const pov = new URL(url).searchParams.get(VIEW_PARAM);
    if (pov) {
        try {
            const [x, y, z, tx, ty, tz] = pov.split(',').map(s => Number.parseFloat(s));

            instance.camera.camera3D.position.set(x, y, z);
            instance.controls.target.set(tx, ty, tz);
        } finally {
            instance.notifyChange();
        }
    }
}

function updateUrl(instance) {
    const url = new URL(document.URL);
    url.searchParams.delete(VIEW_PARAM);

    function round10(n) {
        return Math.round(n * 10) / 10;
    }

    const cam = instance.camera.camera3D.position;
    const target = instance?.controls?.target;
    if (target) {
        const pov = `${round10(cam.x)},${round10(cam.y)},${round10(cam.z)},${round10(target.x)},${round10(target.y)},${round10(target.z)}`;

        url.searchParams.append(VIEW_PARAM, pov);

        window.history.replaceState({}, null, url.toString());
    }
}

let progressBar;
let percent;
let urlTimeout;
let currentInstance;
let pickingRadius;
const tmpVec3 = new Vector3();
const lastCameraPosition = new Vector3(0, 0, 0);
let coordinates;

function updateProgressFrameRequester() {
    progressBar.style.width = `${currentInstance.progress * 100}%`;
    percent.innerText = `${Math.round(currentInstance.progress * 100)}%`;
}

function updateUrlFrameRequester() {
    if (urlTimeout) {
        clearTimeout(urlTimeout);
    }
    urlTimeout = setTimeout(() => updateUrl(currentInstance), 50);
}

function pick(mouseEvent) {
    const cameraPosition = currentInstance.camera.camera3D.getWorldPosition(tmpVec3);
    // Don't pick while the camera is moving
    if (!lastCameraPosition || lastCameraPosition.distanceToSquared(cameraPosition) === 0) {
        const picked = currentInstance.pickObjectsAt(mouseEvent, {
            limit: 1,
            radius: pickingRadius,
        }).at(0);

        if (picked) {
            const crs = currentInstance.referenceCrs;
            coordinates.classList.remove('d-none');
            coordinates.textContent = `${crs} x: ${picked.point.x.toFixed(2)}, y: ${picked.point.y.toFixed(2)}, z: ${picked.point.z.toFixed(2)}`;
        } else {
            coordinates.classList.add('d-none');
        }
    }

    lastCameraPosition.copy(cameraPosition);
}

/**
 * @param {Instance} instance The instance.
 * @param {object} options The options.
 * @param {number} options.radius The radius of the picking.
 * @param {boolean} options.disableUrlUpdate Disable automatic URL update.
 */
function bind(instance, options = {}) {
    pickingRadius = options.radius ?? 1;
    currentInstance = instance;
    // Bind events
    coordinates = document.getElementById('coordinates');
    instance.domElement.addEventListener('mousemove', pick);

    progressBar = document.getElementById('progress-bar');
    percent = document.getElementById('loading-percent');

    instance.addEventListener('update-end', updateProgressFrameRequester);

    if (!options.disableUrlUpdate) {
        processUrl(instance, document.URL);
        instance.addEventListener('update-end', updateUrlFrameRequester);
    }
}

export default { bind };
