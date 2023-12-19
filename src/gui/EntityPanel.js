/**
 * @module gui/EntityPanel
 */
import GUI from 'lil-gui';
import Instance from '../core/Instance';
import EntityInspector from './EntityInspector.js';
import FeatureCollectionInspector from './FeatureCollectionInspector';
import MapInspector from './MapInspector.js';
import AxisGridInspector from './AxisGridInspector.js';
import Panel from './Panel.js';
import Tiles3dInspector from './Tiles3dInspector.js';
import { MAIN_LOOP_EVENTS } from '../core/MainLoop.js';
import PotreePointCloudInspector from './PotreePointCloudInspector.js';

const customInspectors = {
    Map: MapInspector,
    Tiles3D: Tiles3dInspector,
    PotreePointCloud: PotreePointCloudInspector,
    AxisGrid: AxisGridInspector,
    FeatureCollection: FeatureCollectionInspector,
};

/**
 * Provides an inspector for the entities in an instance.
 * To add a custom inspector for a specific entity type,
 * use {@link module:gui/EntityPanel~EntityPanel.registerInspector registerInspector()}.
 *
 */
class EntityPanel extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(gui, instance) {
        super(gui, instance, 'Entities');

        this._frameRequester = () => this.update();
        this.instance.addFrameRequester(
            MAIN_LOOP_EVENTS.UPDATE_START,
            this._frameRequester,
        );

        // rebuild the inspectors when the instance is updated
        this._createInspectorsCb = () => this.createInspectors();
        this.instance.addEventListener('entity-added', this._createInspectorsCb);
        this.instance.addEventListener('entity-removed', this._createInspectorsCb);

        this.folders = [];
        this.inspectors = [];
        this.createInspectors();
    }

    dispose() {
        this.instance.removeFrameRequester(MAIN_LOOP_EVENTS.UPDATE_START, this._frameRequester);
        this.instance.removeEventListener('entity-added', this._createInspectorsCb);
        this.instance.removeEventListener('entity-removed', this._createInspectorsCb);
        while (this.folders.length > 0) {
            this.folders.pop().destroy();
        }
        while (this.inspectors.length > 0) {
            this.inspectors.pop().dispose();
        }
    }

    /**
     * Registers an inspector for an entity type.
     *
     * @static
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
            this.inspectors.pop().dispose();
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
