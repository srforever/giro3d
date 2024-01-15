// eslint-disable-next-line import/no-named-as-default
import type GUI from 'lil-gui';
import { VERSION as olversion } from 'ol/util.js';
import type Instance from '../core/Instance';
import Panel from './Panel';
import VERSION from '../version';

class PackageInfoInspector extends Panel {
    olversion: string;
    giro3dVersion: string;

    /**
     * @param parentGui The parent GUI.
     * @param instance The Giro3D instance.
     */
    constructor(parentGui: GUI, instance: Instance) {
        super(parentGui, instance, 'Info');

        this.olversion = olversion;
        this.giro3dVersion = VERSION;

        this.addController(this, 'giro3dVersion').name('Giro3D version');
        this.addController(window, '__THREE__').name('THREE.js version');
        this.addController(this, 'olversion').name('OpenLayers version');
    }
}

export default PackageInfoInspector;
