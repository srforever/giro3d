import Stamen from 'ol/source/Stamen.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import Extent from '@giro3d/giro3d/Core/Geographic/Extent.js';
import Instance from '@giro3d/giro3d/Core/Instance.js';
import ColorLayer from '@giro3d/giro3d/Core/layer/ColorLayer.js';
import { Map } from '@giro3d/giro3d/entities/Map.js';
import Panel from '@giro3d/giro3d/gui/Panel.js';

class MyCustomPanel extends Panel {
    /**
     * @param {GUI} parentGui The parent GUI.
     * @param {Map} map The observed map.
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(parentGui, map, instance) {
        super(parentGui, instance, 'Custom panel');

        this.map = map;

        this.myCheckBox = true;

        this.addController(this, 'sayHello').name('Press this button!');
        this.addController(this, 'myCheckBox').name('Check this box !').onChange(value => {
            this.map.object3d.visible = value;
            this.instance.notifyChange(this.map);
        });
    }

    // eslint-disable-next-line class-methods-use-this
    sayHello() {
        console.log('hello from my custom panel !');
    }
}

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    -20037508.342789244, 20037508.342789244,
    -20037508.342789244, 20037508.342789244,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv, { crs: extent.crs() });

const map = new Map('planar', { extent });
instance.add(map);

// Adds an TMS imagery layer
const source = new Stamen({ layer: 'watercolor', wrapX: false });

map.addLayer(new ColorLayer('osm', { source }));

// Create camera and controls
instance.camera.camera3D.position.set(0, 0, 25000000);
const controls = new MapControls(instance.camera.camera3D, viewerDiv);
instance.useTHREEControls(controls);

// Attach the inspector to the DOM
const inspector = Inspector.attach(document.getElementById('panelDiv'), instance);

const myCustomPanel = new MyCustomPanel(inspector.gui, map, instance);

// Add our custom panel to the inspector.
inspector.addPanel(myCustomPanel);

// Trigger the first render
instance.notifyChange(map);
