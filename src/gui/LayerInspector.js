/**
 * @module gui/LayerInspector
 */
import GUI from 'lil-gui';
import Instance from '../Core/Instance.js';
import Layer from '../Core/layer/Layer.js';
import Panel from './Panel.js';
import { UPDATE_STRATEGIES } from '../Core/layer/LayerUpdateStrategy.js';

/**
 * Inspector for a {@link module:Core/layer/Layer~Layer Layer}.
 *
 * @api
 */
class LayerInspector extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {Layer} layer The layer to inspect
     */
    constructor(gui, instance, layer) {
        super(gui, instance, `${layer.id} (${layer.type})`);

        /**
         * The inspected layer.
         *
         * @type {Layer}
         * @api
         */
        this.layer = layer;

        this.backgroundColor = this.layer.backgroundColor || 'none';

        this.addController(this.layer, 'projection')
            .name('Projection');

        this.addController(this.layer, 'protocol')
            .name('Protocol');

        if (this.layer.opacity) {
            this.addController(this.layer, 'opacity')
                .name('Opacity')
                .min(0)
                .max(1)
                .onChange(() => this.notify(layer));
        }

        this.addColorController(this, 'backgroundColor')
            .name('Background');

        this.addController(this.layer.updateStrategy, 'type', UPDATE_STRATEGIES)
            .name('Update strategy');
    }
}

export default LayerInspector;
