import type GUI from 'lil-gui';
import { CameraHelper, type OrthographicCamera, type PerspectiveCamera, type Vector3 } from 'three';
import Panel from './Panel';
import type Instance from '../core/Instance';
import type Camera from '../renderer/Camera';
import Ellipsoid from '../core/geographic/Ellipsoid';

const degreesFormatter = new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit: 'degree',
    unitDisplay: 'narrow',
    maximumFractionDigits: 4,
});

const altitudeFormatter = new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit: 'meter',
    maximumFractionDigits: 0,
});

class CameraInspector extends Panel {
    camera: Camera;
    camera3D: PerspectiveCamera | OrthographicCamera;
    snapshots: CameraHelper[] = [];
    latitude = '';
    longitude = '';
    altitude = '';

    /**
     * @param gui - The GUI.
     * @param instance - The Giro3D instance.
     */
    constructor(gui: GUI, instance: Instance) {
        super(gui, instance, 'Camera');

        this.camera = this.instance.camera;
        this.camera3D = this.camera.camera3D;

        const notify = this.notify.bind(this);

        this.addController<string>(this.camera3D, 'type').name('Type');
        this.addController<number>(instance.mainLoop, 'automaticCameraPlaneComputation')
            .name('Automatic plane computation')
            .onChange(notify);
        this.addController<number>(this.camera3D, 'far').name('Far plane').onChange(notify);
        this.addController<number>(this.camera3D, 'near').name('Near plane').onChange(notify);
        this.addController<number>(this.camera, 'maxFarPlane')
            .name('Max far plane')
            .onChange(notify);
        this.addController<number>(this.camera, 'minNearPlane')
            .name('Min near plane')
            .onChange(notify);
        this.addController<number>(this.camera, 'width').name('Width (pixels)');
        this.addController<number>(this.camera, 'height').name('Height (pixels)');
        this.addController<void>(this, 'createFrustumSnapshot').name('Create frustum snapshot');
        this.addController<void>(this, 'deleteSnapshots').name('Delete frustum snapshots');

        const position = this.gui.addFolder('Position');
        position.close();
        if (instance.referenceCrs === 'EPSG:4978') {
            const c0 = this.addController<number>(this, 'latitude').name('Latitude');
            const c1 = this.addController<number>(this, 'longitude').name('Longitude');
            const c2 = this.addController<number>(this, 'altitude').name('Altitude');
            c0.disable(true);
            c1.disable(true);
            c2.disable(true);
        }
        this._controllers.push(position.add(this.camera3D.position, 'x'));
        this._controllers.push(position.add(this.camera3D.position, 'y'));
        this._controllers.push(position.add(this.camera3D.position, 'z'));

        if (this.instance.controls && 'target' in this.instance.controls) {
            const target = this.gui.addFolder('Target');
            target.close();
            this._controllers.push(target.add(this.instance.controls.target as Vector3, 'x'));
            this._controllers.push(target.add(this.instance.controls.target as Vector3, 'y'));
            this._controllers.push(target.add(this.instance.controls.target as Vector3, 'z'));
        }
    }

    updateValues(): void {
        const { x, y, z } = this.camera3D.position;
        const geodetic = Ellipsoid.WGS84.toGeodetic(x, y, z);
        this.latitude = degreesFormatter.format(geodetic.latitude);
        this.longitude = degreesFormatter.format(geodetic.longitude);
        this.altitude = altitudeFormatter.format(geodetic.altitude);
    }

    private deleteSnapshots() {
        this.snapshots.forEach(helper => {
            helper.dispose();
            this.instance.remove(helper);
        });
        this.snapshots.length = 0;
    }

    private createFrustumSnapshot() {
        const helper = new CameraHelper(this.instance.camera.camera3D);
        this.instance.add(helper);
        helper.update();
        this.instance.notifyChange();
        helper.updateMatrixWorld(true);
        this.snapshots.push(helper);
    }
}

export default CameraInspector;
