/**
 * @module gui/PotreePointCloudInspector
 */
import GUI from 'lil-gui';
import { Group } from 'three';

import Instance from '@giro3d/giro3d/core/Instance.js';
import PotreePointCloud from '@giro3d/giro3d/entities/PotreePointCloud.js';

import EntityInspector from './EntityInspector.js';

class PotreePointCloudInspector extends EntityInspector {
    /**
     * Creates an instance of MapInspector.
     *
     * @api
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {PotreePointCloud} entity The inspected 3D tileset.
     */
    constructor(parentGui, instance, entity) {
        super(parentGui, instance, entity,
            {
                title: `PotreePointCloud ('${entity.id}')`,
                visibility: true,
                boundingBoxColor: false,
                boundingBoxes: true,
                opacity: true,
            });

        /**
         * The inspected tileset.
         *
         * @type {PotreePointCloud}
         * @api
         */
        this.tiles3d = entity;

        /**
         * The SSE of the entity.
         *
         * @type {number}
         * @api
         */
        this.sse = this.tiles3d.sseThreshold;

        this.bboxRoot = new Group();
        this.bboxRoot.name = 'inspector';
        this.instance.scene.add(this.bboxRoot);

        this.budgetThousands = this.entity.pointBudget
            ? this.entity.pointBudget / 1000
            : 2000;

        this.addController(this, 'budgetThousands')
            .min(1)
            .max(10000)
            .name('Point budget (thousands)')
            .onChange(v => this.updatePointBudget(v));

        this.addController(this.entity, 'pointSize')
            .min(1)
            .max(10)
            .name('Point size (pixels)')
            .onChange(() => this.notify());

        this.addController(this, 'sse')
            .min(0.01)
            .max(100)
            .name('Screen Space Error')
            .onChange(v => this.updateSSE(v));
    }

    updatePointBudget(budgetThousands) {
        this.entity.pointBudget = budgetThousands * 1000;
        this.notify();
    }

    updateSSE(v) {
        this.tiles3d.sseThreshold = v;
        this.notify();
    }

    toggleBoundingBoxes(visible) {
        this.entity.bboxes.visible = visible;
        this.notify();
    }

    notify() {
        this.instance.notifyChange(this.entity);
    }
}

export default PotreePointCloudInspector;
