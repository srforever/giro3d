// eslint-disable-next-line import/no-named-as-default
import type GUI from 'lil-gui';
import type { FrameRequesterCallback } from '../core/Instance';
import type Instance from '../core/Instance';
import type EntityInspector from './EntityInspector';
import FeatureCollectionInspector from './FeatureCollectionInspector';
import MapInspector from './MapInspector';
import AxisGridInspector from './AxisGridInspector';
import Panel from './Panel';
import Tiles3dInspector from './Tiles3dInspector';
import PotreePointCloudInspector from './PotreePointCloudInspector';
import type Entity3D from '../entities/Entity3D';

const customInspectors: Record<string, typeof EntityInspector> = {
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
    private _frameRequester: FrameRequesterCallback;
    private _createInspectorsCb: () => void;
    folders: GUI[];
    inspectors: EntityInspector[];

    /**
     * @param gui The GUI.
     * @param instance The Giro3D instance.
     */
    constructor(gui: GUI, instance: Instance) {
        super(gui, instance, 'Entities');

        this._frameRequester = () => this.update();
        this.instance.addFrameRequester('update_start', this._frameRequester);

        // rebuild the inspectors when the instance is updated
        this._createInspectorsCb = () => this.createInspectors();
        this.instance.addEventListener('entity-added', this._createInspectorsCb);
        this.instance.addEventListener('entity-removed', this._createInspectorsCb);

        this.folders = [];
        this.inspectors = [];
        this.createInspectors();
    }

    dispose() {
        this.instance.removeFrameRequester('update_start', this._frameRequester);
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
     * @param type The entity type. This should match the property `type` on the entity.
     * @param inspector The inspector.
     * @example
     * EntityPanel.registerInspector('Map', MyCustomMapInspector);
     */
    static registerInspector(type: string, inspector: typeof EntityInspector) {
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
            .getObjects(x => (x as Entity3D).isEntity3D)
            .forEach((entity: Entity3D) => {
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
