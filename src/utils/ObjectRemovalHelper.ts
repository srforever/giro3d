import type { BufferGeometry, Material, Object3D } from 'three';
import type Entity from '../entities/Entity';

interface RemovableObject extends Object3D {
    geometry?: BufferGeometry;
    material?: Material;
    children: RemovableObject[];
}

export default {
    /**
     * Cleanup obj to release three.js allocated resources
     *
     * @param obj object to release
     */
    cleanup(obj: RemovableObject) {
        obj.userData.parentEntity = null;

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
     * Remove obj's children belonging to an entity.
     * Neither obj nor its children will be disposed!
     *
     * @param entity The entity that objects must belong to. Other
     * object are ignored
     * @param obj The Object3D we want to clean
     * @returns an array of removed Object3D from obj (not including the recursive removals)
     */
    removeChildren(entity: Entity, obj: RemovableObject) {
        const toRemove = obj.children.filter(c => c.userData.parentEntity === entity);
        obj.remove(...toRemove);
        return toRemove;
    },

    /**
     * Remove obj's children belonging to a entity and cleanup objexts.
     * obj will be disposed but its children **won't**!
     *
     * @param entity The entity that objects must belong to. Other
     * object are ignored
     * @param obj The Object3D we want to clean
     * @returns an array of removed Object3D from obj (not including the recursive removals)
     */
    removeChildrenAndCleanup(entity: Entity, obj: RemovableObject) {
        const toRemove = obj.children.filter(c => c.userData.parentEntity === entity);

        if (obj.userData.parentEntity === entity) {
            this.cleanup(obj);
        }

        obj.remove(...toRemove);
        return toRemove;
    },

    /**
     * Recursively remove obj's children belonging to an entity.
     * All removed obj will have their geometry/material disposed.
     *
     * @param entity The entity that objects must belong to. Other
     * object are ignored
     * @param obj The Object3D we want to clean
     * @returns an array of removed Object3D from obj (not including the recursive removals)
     */
    removeChildrenAndCleanupRecursively(entity: Entity, obj: RemovableObject) {
        const toRemove = obj.children.filter(c => c.userData.parentEntity === entity);
        for (const c of toRemove) {
            this.removeChildrenAndCleanupRecursively(entity, c);
        }
        if (obj.userData.parentEntity === entity) {
            this.cleanup(obj);
        }
        obj.remove(...toRemove);
        return toRemove;
    },
};
