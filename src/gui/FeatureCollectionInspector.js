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
        this.addController(this, 'frozen')
            .name('Freeze updates')
            .onChange(v => this.toggleFrozen(v));
        this.addController(this, 'dumpTiles').name('Dump tiles in console');
    }

    dumpTiles() {
        console.log(this.features.level0Nodes);
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

    toggleFrozen(value) {
        this.features.frozen = value;
        this.notify();
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
