// eslint-disable-next-line import/no-named-as-default
import type GUI from 'lil-gui';
import type { PerspectiveCamera, Vector3 } from 'three';
import Panel from './Panel';
import type Instance from '../core/Instance';
import type Camera from '../renderer/Camera';

class CameraInspector extends Panel {
    camera: Camera;
    camera3D: PerspectiveCamera;

    /**
     * @param gui - The GUI.
     * @param instance - The Giro3D instance.
     */
    constructor(gui: GUI, instance: Instance) {
        super(gui, instance, 'Camera');

        this.camera = this.instance.camera;
        this.camera3D = this.camera.camera3D;

        this.addController<string>(this.camera3D, 'type').name('Type');
        this.addController<number>(this.camera3D, 'far').name('Far clip');
        this.addController<number>(this.camera3D, 'near').name('Near clip');
        this.addController<number>(this.camera, 'width').name('Width (pixels)');
        this.addController<number>(this.camera, 'height').name('Height (pixels)');

        const position = this.gui.addFolder('Position');
        position.close();
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
}

export default CameraInspector;
