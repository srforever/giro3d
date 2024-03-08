import type { Controller } from 'lil-gui';
// eslint-disable-next-line import/no-named-as-default
import type GUI from 'lil-gui';
import type { Color, Material, Object3D } from 'three';
import type Instance from '../core/Instance';
import type FeatureCollection from '../entities/FeatureCollection';
import Helpers from '../helpers/Helpers';
import EntityInspector from './EntityInspector';
import type PickResult from '../core/picking/PickResult';

function applyToMaterial(
    root: Object3D,
    entity: FeatureCollection,
    callback: (material: Material) => void,
) {
    root.traverse(object => {
        if ((object as any).material && object.userData.parentEntity === entity) {
            callback((object as any).material as Material);
        }
    });
}

type SwitchState = (newState: object, ...args: any[]) => void;
interface Context {
    instance: Instance;
    featureCollection: FeatureCollection;
}

// NOTE: this is a quick and custom implementation of the state pattern. Each state have a
// `doButtonAction` which implements the state changing when the user click on the button.
// doButtonAction and enter (called when we switch to this state) receive a `switchState` callback
// to give them a chance to transitino the state
const FILTER_STATE = {
    NONE: {
        cursor: 'auto',
        buttonLabel: 'Hide all but clicked',
        enter: function enter(switchState: SwitchState, context: Context) {
            const { instance, featureCollection } = context;
            featureCollection.object3d.traverse((o: any) => {
                if (o.material) {
                    o.material.visible = true;
                }
            });
            instance.notifyChange(true);
        },
        doButtonAction: function doButtonAction(switchState: SwitchState) {
            switchState(FILTER_STATE.PICKING);
        },
    },
    PICKING: {
        cursor: 'crosshair',
        buttonLabel: 'Cancel picking',
        enter: function enter(switchState: SwitchState, context: Context) {
            const { instance, featureCollection } = context;
            if (!this._filteringFn) {
                this._filteringFn = (e: MouseEvent) => {
                    const picked = instance.pickObjectsAt(
                        e,
                        { limit: 1, radius: 1, where: [featureCollection] },
                    );
                    if (picked.length !== 0) {
                        instance.domElement.removeEventListener('click', this._filteringFn);
                        switchState(FILTER_STATE.FILTERING, picked[0]);
                    }
                };
            }
            instance.domElement.addEventListener('click', this._filteringFn);
        },
        doButtonAction: function doButtonAction(switchState: SwitchState, { instance }: Context) {
            instance.domElement.removeEventListener('click', this._filteringFn);
            switchState(FILTER_STATE.NONE);
        },
    },
    FILTERING: {
        cursor: 'auto',
        buttonLabel: 'Cancel hiding',
        enter(switchState: SwitchState, context: Context, ...args: any[]) {
            const { instance, featureCollection } = context;
            const picked = args[0] as PickResult;
            console.log('Filtering', picked, picked.object);
            const filteringFeature = picked.object.userData;
            featureCollection.object3d.traverse((o: any) => {
                if (o.material && o.userData !== filteringFeature) {
                    o.material.visible = false;
                }
            });
            instance.notifyChange(true);
        },
        doButtonAction(switchState: SwitchState) {
            switchState(FILTER_STATE.NONE);
        },
    },
};

type FilterState = typeof FILTER_STATE[keyof typeof FILTER_STATE];

class FeatureCollectionInspector extends EntityInspector {
    /** The inspected FeatureCollection. */
    featureCollection: FeatureCollection;
    /** Toggle the wireframe rendering of the features. */
    wireframe: boolean;
    /** Toggle the frozen property of the features. */
    frozen: boolean;
    /** Store the CRS code of this.featureCollection */
    dataProjection: string;
    showGrid: boolean;
    hideAllController: Controller;
    filterState: FilterState;

    /**
     * Creates an instance of FeatureCollectionInspector.
     *
     * @param parentGui - The parent GUI.
     * @param instance - The Giro3D instance.
     * @param featureCollection - The inspected Features.
     */
    constructor(parentGui: GUI, instance: Instance, featureCollection: FeatureCollection) {
        super(parentGui, instance, featureCollection, {
            title: `Features ('${featureCollection.id}')`,
            visibility: true,
            boundingBoxColor: true,
            boundingBoxes: true,
            opacity: true,
        });

        this.featureCollection = featureCollection;
        // FIXME: wireframe not defined on featureCollection ?!
        // @ts-ignore
        this.wireframe = this.featureCollection.wireframe ?? false;
        this.frozen = this.featureCollection.frozen ?? false;
        this.dataProjection = this.featureCollection.dataProjection || '';

        this.showGrid = false;

        this.addController<string>(this, 'dataProjection').name('Data projection');
        this.addController<boolean>(this, 'wireframe')
            .name('Wireframe')
            .onChange(v => this.toggleWireframe(v));
        this.addController<never>(this, 'dumpTiles').name('Dump tiles in console');
        this.hideAllController = this.addController<never>(this, 'hideAllButClicked');
        this.filterState = FILTER_STATE.NONE;
        this.applyFilterState(this.filterState, this.featureCollection);
    }

    dumpTiles() {
        console.log(this.featureCollection.level0Nodes);
    }

    applyFilterState(state: FilterState, ...args: any[]) {
        this.instance.domElement.style.cursor = state.cursor;
        this.hideAllController.name(state.buttonLabel);
        this.filterState = state;
        state.enter(this.applyFilterState.bind(this), {
            featureCollection: this.featureCollection,
            instance: this.instance,
        }, [...args]);
    }

    hideAllButClicked() {
        this.filterState.doButtonAction(this.applyFilterState.bind(this), {
            featureCollection: this.featureCollection,
            instance: this.instance,
        });
    }

    /**
     * @param tile - The tile to decorate.
     * @param add - If true, bounding box is added, otherwise it is removed.
     * @param color - The bounding box color.
     */
    // eslint-disable-next-line class-methods-use-this
    addOrRemoveBoundingBox(tile: Object3D, add: boolean, color: Color) {
        if (add && 'boundingBox' in tile && tile.visible) {
            Helpers.addBoundingBox(tile, color);
        } else {
            Helpers.removeBoundingBox(tile);
        }
    }

    toggleWireframe(value: boolean) {
        (this.featureCollection as any).wireframe = value;
        applyToMaterial(this.rootObject, this.featureCollection, material => {
            (material as any).wireframe = value;
        });
        this.notify(this.featureCollection);
    }
}

export default FeatureCollectionInspector;
