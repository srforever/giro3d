/**
 * @module gui/EntityPanel
 */
import GUI from 'lil-gui';
import Instance, { INSTANCE_EVENTS } from '../Core/Instance.js';
import EntityInspector from './EntityInspector.js';
import MapInspector from './MapInspector.js';
import Panel from './Panel.js';
import Tiles3dInspector from './Tiles3dInspector.js';
import { MAIN_LOOP_EVENTS } from '../Core/MainLoop.js';
import PotreePointCloudInspector from './PotreePointCloudInspector.js';

const customInspectors = {};

/**
 * Provides an inspector for the entities in an instance.
 * To add a custom inspector for a specific entity type,
 * use {@link module:gui/EntityPanel~EntityPanel.registerInspector registerInspector()}.
 *
 * @api
 */
class EntityPanel extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(gui, instance) {
        super(gui, instance, 'Entities');

        EntityPanel.registerInspector('Map', MapInspector);
        EntityPanel.registerInspector('Tiles3D', Tiles3dInspector);
        EntityPanel.registerInspector('PotreePointCloud', PotreePointCloudInspector);

        this.instance.addFrameRequester(
            MAIN_LOOP_EVENTS.UPDATE_START,
            () => this.update(),
        );

        // rebuild the inspectors when the instance is updated
        this.instance.addEventListener(
            INSTANCE_EVENTS.ENTITY_ADDED,
            () => this.createInspectors(),
        );
        this.instance.addEventListener(
            INSTANCE_EVENTS.ENTITY_REMOVED,
            () => this.createInspectors(),
        );

        this.folders = [];
        this.inspectors = [];
        this.createInspectors();
    }

    /**
     * Registers an inspector for an entity type.
     *
     * @static
     * @api
     * @param {string} type The entity type. This should match the property `type` on the entity.
     * @param {EntityInspector} inspector The inspector.
     * @example
     * EntityPanel.registerInspector('Map', MyCustomMapInspector);
     */
    static registerInspector(type, inspector) {
        customInspectors[type] = inspector;
    }

    update() {
        this.inspectors.forEach(i => i.update());
    }

    createInspectors() {
        while (this.folders.length > 0) {
            this.folders.pop().destroy();
        }
        while (this.inspectors.length > 0) {
            this.inspectors.pop();
        }

        this.instance
            .getObjects(x => !x.isObject3D)
            .forEach(entity => {
                const type = entity.type;
                if (customInspectors[type]) {
                    const inspector = new customInspectors[type](this.gui, this.instance, entity);
                    this.inspectors.push(inspector);
                    this.folders.push(inspector.gui);
                } else {
                    console.warn(`no inspector found for entity type ${type}`);
                }
            });
    }
}

export default EntityPanel;
