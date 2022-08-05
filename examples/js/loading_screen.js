import { INSTANCE_EVENTS } from '../../src/Core/Instance.js';

export default function setupLoadingScreen(viewerDiv, view) {
    let loadingScreenContainer;

    if (view.isDebugMode) {
        return;
    }

    // loading screen
    loadingScreenContainer = document.createElement('div');
    // eslint-disable-next-line no-multi-str
    loadingScreenContainer.innerHTML = '\
        <div class="text">\
        <span class="c1">G</span><span class="c2">i</span><span class="c3">r</span><span class="c4">o</span><span class="c5">3</span><span class="c6">d</span>\
        </div>';
    loadingScreenContainer.id = 'giro3d-loader';
    viewerDiv.appendChild(loadingScreenContainer);

    // auto-hide in 3 sec or if view is loaded
    function hideLoader() {
        if (!loadingScreenContainer) {
            return;
        }
        loadingScreenContainer.style.opacity = 0;
        loadingScreenContainer.style.pointerEvents = 'none';
        loadingScreenContainer.style.transition = 'opacity 0.5s cubic-bezier(0.55, 0.085, 0.68, 0.53)';

        loadingScreenContainer.addEventListener('transitionend', e => {
            viewerDiv.removeChild(e.target);
        });
        loadingScreenContainer = null;
        view.removeEventListener(
            INSTANCE_EVENTS.LAYERS_INITIALIZED,
            hideLoader,
        );
    }

    view.addEventListener(INSTANCE_EVENTS.LAYERS_INITIALIZED, hideLoader);
    setTimeout(hideLoader, 3000);
}
