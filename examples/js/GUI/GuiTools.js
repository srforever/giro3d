/**
 * Generated On: 2015-10-5
 * Class: GuiTools
 * Description: Classe pour créer un menu.
 */

/* global dat,viewerDiv, giro3d */

dat.GUI.prototype.removeFolder = function removeFolder(name) {
    const folder = this.__folders[name];
    if (!folder) {
        return;
    }
    folder.close();
    this.__ul.removeChild(folder.domElement.parentNode);
    delete this.__folders[name];
    this.onResize();
};

dat.GUI.prototype.hideFolder = function hideFolder(name, value) {
    const folder = this.__folders[name];
    if (!folder) {
        return;
    }
    folder.__ul.hidden = value;
};

// TODO :
// - view should be instances
// - we should walk through the objects, then through the color and
function GuiTools(domId, instance, w) {
    const width = w || 245;
    this.gui = new dat.GUI({ autoPlace: false, width });
    this.gui.domElement.id = domId;
    viewerDiv.appendChild(this.gui.domElement);
    this.colorGui = this.gui.addFolder('Color Layers');
    this.elevationGui = this.gui.addFolder('Elevation Layers');

    if (instance) {
        this.instance = instance;
        // TODO should be on map
        instance.addEventListener('layers-order-changed', () => {
            let i;
            const colorLayers = instance.getLayers(l => l instanceof giro3d.ColorLayer);
            for (i = 0; i < colorLayers.length; i++) {
                this.removeLayersGUI(colorLayers[i].id);
            }

            this.addImageryLayersGUI(colorLayers);
        });
    }
}

GuiTools.prototype.addLayersGUI = function fnAddLayersGUI() {
    function filterColor(l) { return l instanceof giro3d.ColorLayer; }
    function filterElevation(l) { return l instanceof giro3d.ElevationLayer; }
    // TODO should be on map
    this.addImageryLayersGUI(this.instance.getLayers(filterColor));
    this.addElevationLayersGUI(this.instance.getLayers(filterElevation));
    console.info('menu initialized');
};

GuiTools.prototype.addImageryLayerGUI = function addImageryLayerGUI(layer) {
    const folder = this.colorGui.addFolder(layer.id);
    folder.add({ visible: layer.visible }, 'visible').onChange(value => {
        layer.visible = value;
        this.instance.notifyChange(layer);
    });
    folder.add({ opacity: layer.opacity }, 'opacity').min(0.0).max(1.0).onChange(value => {
        layer.opacity = value;
        this.instance.notifyChange(layer);
    });
    folder.add({ frozen: layer.frozen }, 'frozen').onChange(value => {
        layer.frozen = value;
        this.instance.notifyChange(layer);
    });
};

GuiTools.prototype.addElevationLayerGUI = function addElevationLayerGUI(layer) {
    const folder = this.elevationGui.addFolder(layer.id);
    folder.add({ frozen: layer.frozen }, 'frozen').onChange(value => {
        layer.frozen = value;
    });
};

GuiTools.prototype.addImageryLayersGUI = function addImageryLayersGUI(layers) {
    let i;
    const seq = giro3d.ImageryLayers.getColorLayersIdOrderedBySequence(layers);
    const sortedLayers = layers.sort((a, b) => seq.indexOf(a.id) < seq.indexOf(b.id));
    for (i = 0; i < sortedLayers.length; i++) {
        this.addImageryLayerGUI(sortedLayers[i]);
    }
};

GuiTools.prototype.addElevationLayersGUI = function addElevationLayersGUI(layers) {
    let i;
    for (i = 0; i < layers.length; i++) {
        this.addElevationLayerGUI(layers[i]);
    }
};

GuiTools.prototype.removeLayersGUI = function removeLayersGUI(nameLayer) {
    this.colorGui.removeFolder(nameLayer);
};

GuiTools.prototype.addGUI = function addGUI(name, value, callback) {
    this[name] = value;
    this.gui.add(this, name).onChange(callback);
};

GuiTools.prototype.hideFolder = function hideFolder(nameLayer, value) {
    this.colorGui.hideFolder(nameLayer, value);
};
