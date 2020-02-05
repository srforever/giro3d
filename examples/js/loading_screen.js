/* global giro3d */

// eslint-disable-next-line no-unused-vars
function setupLoadingScreen(viewerDiv, view) {
    var loadingScreenContainer;

    if (view.isDebugMode) {
        return;
    }

    // loading screen
    loadingScreenContainer = document.createElement('div');
    // eslint-disable-next-line no-multi-str
    loadingScreenContainer.innerHTML = '\
        <div class="text">\
        <span class="c1">i</span><span class="c2">T</span><span class="c3">o</span><span class="c4">w</span><span class="c5">n</span><span class="c6">s</span>\
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

        loadingScreenContainer.addEventListener('transitionend', function _(e) {
            viewerDiv.removeChild(e.target);
        });
        loadingScreenContainer = null;
        view.removeEventListener(
            giro3d.VIEW_EVENTS.LAYERS_INITIALIZED,
            hideLoader);
    }

    view.addEventListener(giro3d.VIEW_EVENTS.LAYERS_INITIALIZED, hideLoader);
    setTimeout(hideLoader, 3000);
}
