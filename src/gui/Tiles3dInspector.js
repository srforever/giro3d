/**
 * @module gui/Tiles3dInspector
 */
import GUI from 'lil-gui';
import { Color } from 'three';
import Instance from '../core/Instance';
import Tiles3D from '../entities/Tiles3D.js';
import Helpers from '../helpers/Helpers.js';
import EntityInspector from './EntityInspector.js';

class Tiles3dInspector extends EntityInspector {
    /**
     * Creates an instance of Tiles3dInspector.
     *
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {Tiles3D} entity The inspected 3D tileset.
     */
    constructor(parentGui, instance, entity) {
        super(parentGui, instance, entity,
            {
                title: `Tiles3D ('${entity.id}')`,
                visibility: true,
                boundingBoxColor: true,
                boundingBoxes: true,
                opacity: true,
            });

        /**
         * The inspected tileset.
         *
         * @type {Tiles3D}
         */
        this.tiles3d = entity;

        /**
         * Toggle the wireframe rendering of the entity.
         *
         * @type {boolean}
         */
        this.wireframe = this.tiles3d.wireframe || false;

        /**
         * The SSE of the entity.
         *
         * @type {number}
         */
        this.sse = this.tiles3d.sseThreshold;

        this.gui.add(this, 'wireframe')
            .name('Wireframe')
            .onChange(v => this.toggleWireframe(v));
        this.gui.add(this, 'sse')
            .min(this.sse / 4)
            .max(this.sse * 4)
            .name('Screen Space Error')
            .onChange(v => this.updateSSE(v));
        this.gui.add(this.tiles3d, 'cleanupDelay')
            .min(10)
            .max(10000)
            .name('Cleanup delay (ms)')
            .onChange(() => this.notify());

        if (this.tiles3d.material) {
            this.gui.add(this.tiles3d.material, 'brightness')
                .min(-1)
                .max(1)
                .name('Brightness')
                .onChange(() => this.instance.notifyChange(this.tiles3d));
            this.addController(this.tiles3d.material, 'contrast')
                .name('Contrast')
                .min(0)
                .max(10)
                .onChange(() => this.instance.notifyChange(this.tiles3d));
            this.addController(this.tiles3d.material, 'saturation')
                .name('Saturation')
                .min(0)
                .max(10)
                .onChange(() => this.instance.notifyChange(this.tiles3d));
        }
    }

    toggleWireframe(value) {
        this.tiles3d.wireframe = value;
        this.notify();
    }

    updateSSE(v) {
        this.tiles3d.sseThreshold = v;
        this.notify();
    }

    notify() {
        this.instance.notifyChange(this.instance.camera.camera3D);
    }

    toggleBoundingBoxes(visible) {
        this.rootObject.traverseOnce(obj => {
            if (visible) {
                const { metadata } = obj.userData;
                if (metadata) {
                    const result = Helpers.create3DTileBoundingVolume(
                        this.tiles3d,
                        obj,
                        metadata,
                        this.boundingBoxColor,
                    );
                    if (result) {
                        if (result.absolute) {
                            this.rootObject.add(result.object3d);
                        } else {
                            obj.add(result.object3d);
                        }
                        result.object3d.updateMatrixWorld();
                    }
                }
            } else {
                Helpers.remove3DTileBoundingVolume(obj);
            }
        });
        this.notify();
    }

    updateBoundingBoxColor(colorHex) {
        const color = new Color(colorHex);
        this.rootObject.traverse(obj => {
            Helpers.update3DTileBoundingVolume(obj, { color });
        });

        this.notify();
    }
}

export default Tiles3dInspector;
