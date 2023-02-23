const ALLOCATED = [];
let ID = 0;

class MemoryTracker {
    static track(obj, name) {
        if (__DEBUG__) {
            obj.name = (`${name || obj.id} ${ID++}`);
            // eslint-disable-next-line no-undef
            ALLOCATED.push(new WeakRef(obj));
        }
    }

    static getTrackedObjects() {
        const map = {};
        for (const weakref of ALLOCATED) {
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
