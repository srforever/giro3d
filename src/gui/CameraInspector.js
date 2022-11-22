/**
 * @module gui/CameraInspector
 */
import GUI from 'lil-gui';
import Panel from './Panel.js';
import Instance from '../Core/Instance.js';

class CameraInspector extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(gui, instance) {
        super(gui, instance, 'Camera');

        this.camera = this.instance.camera;
        this.camera3D = this.camera.camera3D;

        this.addController(this.camera3D, 'type').name('Type');
        this.addController(this.camera3D, 'far').name('Far clip');
        this.addController(this.camera3D, 'near').name('Near clip');
        this.addController(this.camera, 'width').name('Width (pixels)');
        this.addController(this.camera, 'height').name('Height (pixels)');

        const position = this.gui.addFolder('Position');
        position.close();
        this._controllers.push(position.add(this.camera3D.position, 'x'));
        this._controllers.push(position.add(this.camera3D.position, 'y'));
        this._controllers.push(position.add(this.camera3D.position, 'z'));

        if (this.instance.controls
            && this.instance.controls.target) {
            const target = this.gui.addFolder('Target');
            target.close();
            this._controllers.push(target.add(this.instance.controls.target, 'x'));
            this._controllers.push(target.add(this.instance.controls.target, 'y'));
            this._controllers.push(target.add(this.instance.controls.target, 'z'));
        }
    }
}

export default CameraInspector;
