import { CanvasTexture, Texture } from 'three';

const ALLOCATED = new Map();
let ID = 0;

class MemoryTracker {
    static getCanvasTexture(canvas, name) {
        const texture = new CanvasTexture(canvas);
        MemoryTracker.track(texture, name);
        return texture;
    }

    static track(obj, name) {
        if (__DEBUG__) {
            obj.name = (`${name || obj.id} ${ID++}`);
            // eslint-disable-next-line no-undef
            ALLOCATED.set(obj.name, new WeakRef(obj));
            if (obj.dispose) {
                obj.addEventListener('dispose', MemoryTracker.onDeleted);
            }
        }
    }

    static onDeleted(event) {
        /** @type {Texture} */
        const texture = event.target;
        texture.removeEventListener('dispose', MemoryTracker.onDeleted);
        ALLOCATED.delete(texture.name);
    }

    static getTrackedObjects() {
        const result = [];
        for (const weakref of ALLOCATED.values()) {
            const value = weakref.deref();
            if (value) {
                result.push(value);
            }
        }
        return result;
    }
}

export default MemoryTracker;
