const ALLOCATED = new Map();
let ID = 0;

class MemoryTracker {
    static track(obj, name) {
        if (__DEBUG__) {
            if (ALLOCATED.has(obj)) {
                return;
            }
            obj.name = (`${name || obj.id} ${ID++}`);
            // eslint-disable-next-line no-undef
            ALLOCATED.set(obj, new WeakRef(obj));
            if (obj.dispose) {
                obj.addEventListener('dispose', MemoryTracker.onDeleted);
            }
        }
    }

    static onDeleted(event) {
        const obj = event.target;
        obj.removeEventListener('dispose', MemoryTracker.onDeleted);
        ALLOCATED.delete(obj);
    }

    static getTrackedObjects() {
        const map = {};
        for (const weakref of ALLOCATED.values()) {
            const value = weakref.deref();
            if (value) {
                const key = value.constructor.name;
                if (!map[key]) {
                    map[key] = [];
                }
                map[key].push(value);
            }
        }
        return map;
    }
}

export default MemoryTracker;
