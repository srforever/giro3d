import TileWMS from 'ol/source/TileWMS.js';
// We import from unpkg.com
// import CameraControls from 'camera-controls';

import Instance from '@giro3d/giro3d/core/Instance.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/core/layer/LayerUpdateStrategy.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import PointsMaterial, { MODE } from '@giro3d/giro3d/renderer/PointsMaterial.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import Inspector from '@giro3d/gui/Inspector.js';
import Panel from '@giro3d/gui/Panel.js';

import {
    Clock,
    CubeTextureLoader,
    Vector3,
    Vector2,
    Vector4,
    Quaternion,
    Matrix4,
    Spherical,
    Box3,
    Sphere,
    Raycaster,
} from 'three';
import StatusBar from './widgets/StatusBar.js';

// eslint-disable-next-line no-undef
CameraControls.install({
    THREE: {
        Vector2,
        Vector3,
        Vector4,
        Quaternion,
        Matrix4,
        Spherical,
        Box3,
        Sphere,
        Raycaster,
    },
});

Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 '
    + '+y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

const viewerDiv = document.getElementById('viewerDiv');
const instance = new Instance(viewerDiv, { crs: 'EPSG:3946' });

const material = new PointsMaterial({ size: 4, mode: MODE.TEXTURE });
const pointcloud = new Tiles3D(
    'pointcloud',
    new Tiles3DSource('https://3d.oslandia.com/3dtiles/lyon.3dtiles/tileset.json'),
    { material },
);
const colorize = new TileWMS({
    url: 'https://download.data.grandlyon.com/wms/grandlyon',
    params: {
        LAYERS: 'Ortho2009_vue_ensemble_16cm_CC46',
        FORMAT: 'image/jpeg',
    },
    projection: 'EPSG:3946',
    crossOrigin: 'anonymous',
    version: '1.3.0',
});

const colorLayer = new ColorLayer(
    'wms_imagery',
    {
        source: colorize,
        updateStrategy: {
            type: STRATEGY_DICHOTOMY,
            options: {},
        },
    },
);

instance.add(pointcloud).then(pc => pc.attach(colorLayer));

// Configure our controls
// eslint-disable-next-line no-undef
const controls = new CameraControls(instance.camera.camera3D, instance.domElement);
controls.dollyToCursor = true;
controls.enableDamping = true;
controls.verticalDragToForward = true;

// eslint-disable-next-line no-undef
controls.mouseButtons.left = CameraControls.ACTION.TRUCK;
// eslint-disable-next-line no-undef
controls.mouseButtons.right = CameraControls.ACTION.ROTATE;
// eslint-disable-next-line no-undef
controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
// eslint-disable-next-line no-undef
controls.mouseButtons.middle = CameraControls.ACTION.DOLLY;

// Giro3d integration
instance.controls = controls;
const clock = new Clock();

// Update controls from event loop - this replaces the requestAnimationFrame logic from
// camera-controls sample code
instance.addFrameRequester('before_camera_update', () => {
    // Called from giro3d
    const delta = clock.getDelta();
    const hasControlsUpdated = controls.update(delta);
    if (hasControlsUpdated) {
        instance.notifyChange(instance.camera.camera3D);
    }
});
// As Giro3d runs the event loop only when needed, we need to notify Giro3d when
// the controls update the view.
// We need both events to make sure the view is updated from user interactions and from animations
controls.addEventListener('update', () => instance.notifyChange(instance.camera.camera3D));
controls.addEventListener('control', () => instance.notifyChange(instance.camera.camera3D));

// place camera
controls.setLookAt(1842456, 5174330, 735, 1841993, 5175493, 188);

// And now we can add some custom behavior

const executeInteraction = callback => {
    // Execute the interaction
    const res = callback() ?? Promise.resolve();

    // As mainloop can pause, before_camera_update can be triggered irregularly
    // Make sure to "reset" the clock to enable smooth transitions with camera-controls
    clock.getDelta();
    // Dispatch events so giro3d and giro3dservice gets notified
    controls.dispatchEvent({ type: 'update' });
    return res;
};

// Add some controls on keyboard
const keys = {
    LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown',
};
instance.domElement.addEventListener('keydown', e => {
    let forwardDirection = 0;
    let truckDirectionX = 0;
    const factor = (e.ctrlKey || e.metaKey || e.shiftKey ? 200 : 20);
    switch (e.code) {
        case keys.UP:
            forwardDirection = 1;
            break;

        case keys.BOTTOM:
            forwardDirection = -1;
            break;

        case keys.LEFT:
            truckDirectionX = -1;
            break;

        case keys.RIGHT:
            truckDirectionX = 1;
            break;

        default:
                // do nothing
    }
    if (forwardDirection) {
        executeInteraction(() => controls.forward(
            forwardDirection * controls.truckSpeed * factor, true,
        ));
    }
    if (truckDirectionX) {
        executeInteraction(() => controls.truck(
            truckDirectionX * controls.truckSpeed * factor, 0, true,
        ));
    }
});

// Make rotation around where the user clicked
instance.domElement.addEventListener('contextmenu', e => {
    const picked = instance.pickObjectsAt(e, {
        limit: 1,
        radius: 20,
        filter: p => (
            // Make sure we pick a valid point
            Number.isFinite(p.point.x)
            && Number.isFinite(p.point.y)
            && Number.isFinite(p.point.z)
        ),
    }).at(0);
    if (picked) {
        controls.setOrbitPoint(picked.point.x, picked.point.y, picked.point.z);
    }
});

// add a skybox background
const cubeTextureLoader = new CubeTextureLoader();
cubeTextureLoader.setPath('image/skyboxsun25deg_zup/');
const cubeTexture = cubeTextureLoader.load([
    'px.jpg', 'nx.jpg',
    'py.jpg', 'ny.jpg',
    'pz.jpg', 'nz.jpg',
]);

instance.scene.background = cubeTexture;

const inspector = Inspector.attach(document.getElementById('panelDiv'), instance);

class ControlsInspector extends Panel {
    constructor(gui, _instance, _controls) {
        super(gui, _instance, 'Controls');

        this.controls = _controls;
        this.target = new Vector3();
        this.controls.getTarget(this.target);

        this.addController(this.controls, 'enabled').name('Enabled');
        this.addController(this.controls, 'active').name('Active');

        const target = this.gui.addFolder('Target');
        target.close();
        this._controllers.push(target.add(this.target, 'x'));
        this._controllers.push(target.add(this.target, 'y'));
        this._controllers.push(target.add(this.target, 'z'));

        this._eventhandlers = {
            control: () => this.controls.getTarget(this.target),
        };

        this.addController(this.controls, 'distance').name('Distance');
        this.addController(this.controls, 'polarAngle').name('Polar angle');
        this.addController(this.controls, 'azimuthAngle').name('Azimuth angle');

        this.needsUpdate = false;

        this.controls.addEventListener('update', this._eventhandlers.control);
    }

    dispose() {
        this.controls.removeEventListener('update', this._eventhandlers.control);
        super.dispose();
    }
}

const controlsInspector = new ControlsInspector(inspector.gui, instance, controls);
inspector.addPanel(controlsInspector);

// Add some animations
document.getElementById('animate').onclick = () => {
    executeInteraction(async () => {
        await controls.rotate((Math.random() - 0.5) * (Math.PI / 2), 0, true);
        await controls.rotatePolarTo(Math.PI / 8, true);
        await controls.dolly((Math.random() - 0.5) * 1000, true);
    });
};

StatusBar.bind(instance);
