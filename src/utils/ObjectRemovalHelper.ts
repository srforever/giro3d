import type { BufferGeometry, Material, Object3D } from 'three';
import type Entity from '../entities/Entity';

interface Object3DWithLayer extends Object3D {
    layer?: Entity;
    geometry?: BufferGeometry;
    material?: Material;
    children: Object3DWithLayer[];
}

export default {
    /**
     * Cleanup obj to release three.js allocated resources
     *
     * @param obj object to release
     */
    cleanup(obj: Object3DWithLayer) {
        obj.layer = null;

        if (typeof (obj as any).dispose === 'function') {
            (obj as any).dispose();
        } else {
            if (obj.geometry) {
                obj.geometry.dispose();
                obj.geometry = null;
            }
            if (obj.material) {
                obj.material.dispose();
                obj.material = null;
            }
        }
    },

    /**
     * Remove obj's children belonging to a layer.
     * Neither obj nor its children will be disposed!
     *
     * @param layer The layer that objects must belong to. Other
     * object are ignored
     * @param obj The Object3D we want to clean
     * @returns an array of removed Object3D from obj (not including the recursive removals)
     */
    removeChildren(layer: Entity, obj: Object3DWithLayer) {
        const toRemove = obj.children.filter(c => c.layer === layer);
        obj.remove(...toRemove);
        return toRemove;
    },

    /**
     * Remove obj's children belonging to a layer and cleanup objexts.
     * obj will be disposed but its children **won't**!
     *
     * @param layer The layer that objects must belong to. Other
     * object are ignored
     * @param obj The Object3D we want to clean
     * @returns an array of removed Object3D from obj (not including the recursive removals)
     */
    removeChildrenAndCleanup(layer: Entity, obj: Object3DWithLayer) {
        const toRemove = obj.children.filter(c => c.layer === layer);

        if (obj.layer === layer) {
            this.cleanup(obj);
        }

        obj.remove(...toRemove);
        return toRemove;
    },

    /**
     * Recursively remove obj's children belonging to a layer.
     * All removed obj will have their geometry/material disposed.
     *
     * @param layer The layer that objects must belong to. Other
     * object are ignored
     * @param obj The Object3D we want to clean
     * @returns an array of removed Object3D from obj (not including the recursive removals)
     */
    removeChildrenAndCleanupRecursively(layer: Entity, obj: Object3DWithLayer) {
        const toRemove = obj.children.filter(c => c.layer === layer);
        for (const c of toRemove) {
            this.removeChildrenAndCleanupRecursively(layer, c);
        }
        if (obj.layer === layer) {
            this.cleanup(obj);
        }
        obj.remove(...toRemove);
        return toRemove;
    },
};
