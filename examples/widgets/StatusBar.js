import Instance from '../../src/core/Instance.js';
import { MAIN_LOOP_EVENTS } from '../../src/core/MainLoop.js';

/**
 * @param {Instance} instance The instance.
 * @param {number} radius The radius of the picking.
 */
function bind(instance, radius = 1) {
    // Bind events
    instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));
    const coordinates = document.getElementById('coordinates');
    instance.domElement.addEventListener('mousemove', e => {
        const picked = instance.pickObjectsAt(e, { limit: 1, radius }).at(0);
        if (picked) {
            coordinates.classList.remove('d-none');
            coordinates.textContent = `x: ${picked.point.x.toFixed(2)}, y: ${picked.point.y.toFixed(2)}, z: ${picked.point.z.toFixed(2)}`;
        } else {
            coordinates.classList.add('d-none');
        }
    });

    const progressBar = document.getElementById('progress-bar');
    const percent = document.getElementById('loading-percent');

    instance.addFrameRequester(MAIN_LOOP_EVENTS.UPDATE_END, () => {
        progressBar.style.width = `${instance.progress * 100}%`;
        percent.innerText = `${Math.round(instance.progress * 100)}%`;
    });
}

export default { bind };
