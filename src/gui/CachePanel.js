/**
 * @module gui/CachePanel
 */

import Cache from '../core/scheduler/Cache.js';
import Panel from './Panel.js';

class CachePanel extends Panel {
    constructor(parentGui, instance) {
        super(parentGui, instance, 'Cache');

        this.cache = Cache;
        this.count = 0;

        this.addController(this, 'count').name('Entries');
        this.addController(this, 'flush').name('Delete expired entries');
        this.addController(this, 'clear').name('Clear the cache');
        this.addController(this, 'dump').name('Dump cache to console');
    }

    // eslint-disable-next-line class-methods-use-this
    dump() {
        console.log([...Cache.entries()]);
    }

    flush() {
        Cache.flush();
        this.update();
    }

    clear() {
        Cache.clear();
        this.update();
    }

    updateValues() {
        this.count = Cache.count();
    }
}

export default CachePanel;
