/**
 * @module gui/FeatureCollectionInspector
 */
import GUI from 'lil-gui';
import { Color } from 'three';
import Instance from '../core/Instance.js';
import TileMesh from '../core/TileMesh.js';
import FeatureCollection from '../entities/FeatureCollection.js';
import Helpers from '../helpers/Helpers.js';
import EntityInspector from './EntityInspector.js';

function applyToMaterial(root, entity, callback) {
    root.traverse(object => {
        if (object.material && object.userData.parentEntity === entity) {
            callback(object.material);
        }
    });
}

// NOTE: this is a quick and custom implementation of the state pattern. Each state have a
// `doButtonAction` which implements the state changing when the user click on the button.
// doButtonAction and enter (called when we switch to this state) receive a `switchState` callback
// to give them a chance to transitino the state
const FILTER_STATE = {
    NONE: {
        cursor: 'auto',
        buttonLabel: 'Hide all but clicked',
        enter: function enter(switchState, context) {
            const { instance, features } = context;
            features.object3d.traverse(o => {
                if (o.material) {
                    o.material.visible = true;
                }
            });
            instance.notifyChange(true);
        },
        doButtonAction: function doButtonAction(switchState) {
            switchState(FILTER_STATE.PICKING);
        },
    },
    PICKING: {
        cursor: 'crosshair',
        buttonLabel: 'Cancel picking',
        enter: function enter(switchState, context) {
            const { instance, features } = context;
            if (!this._filteringFn) {
                this._filteringFn = e => {
                    const picked = instance.pickObjectsAt(
                        e,
                        { limit: 1, radius: 1, where: [features] },
                    );
                    if (picked.length !== 0) {
                        instance.domElement.removeEventListener('click', this._filteringFn);
                        switchState(FILTER_STATE.FILTERING, picked[0]);
                    }
                };
            }
            instance.domElement.addEventListener('click', this._filteringFn);
        },
        doButtonAction: function doButtonAction(switchState, { instance }) {
            instance.domElement.removeEventListener('click', this._filteringFn);
            switchState(FILTER_STATE.NONE);
        },
    },
    FILTERING: {
        cursor: 'auto',
        buttonLabel: 'Cancel hiding',
        enter(switchState, context, picked) {
            const { instance, features } = context;
            console.log('Filtering', picked, picked.object);
            const filteringFeature = picked.object.userData;
            features.object3d.traverse(o => {
                if (o.material && o.userData !== filteringFeature) {
                    o.material.visible = false;
                }
            });
            instance.notifyChange(true);
        },
        doButtonAction(switchState) {
            switchState(FILTER_STATE.NONE);
        },
    },
};

class FeatureCollectionInspector extends EntityInspector {
    /**
     * Creates an instance of FeaturesInspector.
     *
     * @api
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {FeatureCollection} features The inspected Features.
     */
    constructor(parentGui, instance, features) {
        super(parentGui, instance, features, {
            title: `Features ('${features.id}')`,
            visibility: true,
            boundingBoxColor: true,
            boundingBoxes: true,
            opacity: true,
        });

        /**
         * The inspected features.
         *
         * @type {FeatureCollection}
         * @api
         */
        this.features = features;

        /**
         * Toggle the wireframe rendering of the features.
         *
         * @type {boolean}
         * @api
         */
        this.wireframe = this.features.wireframe || false;

        /**
         * Toggle the frozen property of the features.
         *
         * @type {boolean}
         * @api
         */
        this.frozen = this.features.frozen || false;

        this.showGrid = false;

        this.addController(this, 'wireframe')
            .name('Wireframe')
            .onChange(v => this.toggleWireframe(v));
        this.addController(this, 'dumpTiles').name('Dump tiles in console');
        this.hideAllController = this.addController(this, 'hideAllButClicked');
        this.filterState = FILTER_STATE.NONE;
        this.applyFilterState(this.filterState, this.features);
    }

    dumpTiles() {
        console.log(this.features.level0Nodes);
    }

    applyFilterState(state, ...args) {
        this.instance.domElement.style.cursor = state.cursor;
        this.hideAllController.name(state.buttonLabel);
        this.filterState = state;
        state.enter(this.applyFilterState.bind(this), {
            features: this.features,
            instance:
            this.instance,
        }, ...args);
    }

    hideAllButClicked() {
        this.filterState.doButtonAction(this.applyFilterState.bind(this), {
            features: this.features,
            instance: this.instance,
        });
    }

    /**
     * @param {TileMesh} tile The tile to decorate.
     * @param {boolean} add If true, bounding box is added, otherwise it is removed.
     * @param {Color} color The bounding box color.
     */
    // eslint-disable-next-line class-methods-use-this
    addOrRemoveBoundingBox(tile, add, color) {
        if (add && tile.boundingBox && tile.visible) {
            Helpers.addBoundingBox(tile, color);
        } else {
            Helpers.removeBoundingBox(tile);
        }
    }

    toggleWireframe(value) {
        this.features.wireframe = value;
        applyToMaterial(this.rootObject, this.features, material => {
            material.wireframe = value;
        });
        this.notify(this.features);
    }
}

export default FeatureCollectionInspector;
