/**
 * @module gui/PackageInfoInspector
 */

import GUI from 'lil-gui';
import { VERSION as olversion } from 'ol/util.js';
import Instance from '../Core/Instance.js';
import Panel from './Panel.js';
import VERSION from '../version.js';

class PackageInfoInspector extends Panel {
    /**
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(parentGui, instance) {
        super(parentGui, instance, 'Info');

        this.olversion = olversion;
        this.giro3dVersion = VERSION;

        this.addController(this, 'giro3dVersion').name('Giro3D version');
        this.addController(window, '__THREE__').name('THREE.js version');
        this.addController(this, 'olversion').name('OpenLayers version');
    }
}

export default PackageInfoInspector;
