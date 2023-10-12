/**
 * @module gui/CachePanel
 */

import { GlobalCache } from '../core/Cache';
import Panel from './Panel.js';

class CachePanel extends Panel {
    constructor(parentGui, instance) {
        super(parentGui, instance, 'Cache');

        this.count = '?';
        this.size = '?';
        this.ttl = GlobalCache.defaultTtl / 1000;
        this.capacityMb = GlobalCache.maxSize / 1024 / 1024;
        this.capacityEntries = GlobalCache.capacity;

        this.addController(GlobalCache, 'enabled').name('Enable cache');
        this.addController(this, 'ttl')
            .name('Default TTL (seconds)')
            .min(1)
            .max(3600)
            .onChange(v => {
                this.ttl = Math.floor(v);
                GlobalCache.defaultTtl = this.ttl * 1000;
            });
        this.addController(this, 'capacityMb')
            .name('Capacity (MB)')
            .min(2)
            .max(1024)
            .onChange(v => {
                this.capacityMb = Math.floor(v);
                GlobalCache.maxSize = this.capacityMb * 1024 * 1024;
            });
        this.addController(this, 'capacityEntries')
            .name('Capacity (entries)')
            .min(0)
            .max(16000)
            .onChange(v => {
                this.capacityEntries = Math.floor(v);
                GlobalCache.capacity = this.capacityEntries;
            });
        this.addController(this, 'count').name('Entries');
        this.addController(this, 'size').name('Memory usage (approx)');
        this.addController(this, 'purge').name('Purge stale entries');
        this.addController(this, 'clear').name('Clear the cache');
        this.addController(this, 'dump').name('Dump cache to console');
    }

    purge() {
        GlobalCache.purge();
        this.update();
    }

    // eslint-disable-next-line class-methods-use-this
    dump() {
        console.log([...GlobalCache.entries()]);
    }

    clear() {
        GlobalCache.clear();
        this.update();
    }

    updateValues() {
        this.count = `${GlobalCache.count} / ${GlobalCache.capacity}`;

        const used = (GlobalCache.size / 1024 / 1024).toFixed(1);
        const maxSize = (GlobalCache.maxSize / 1024 / 1024).toFixed(1);
        this.size = `${used} MB / ${maxSize} MB`;
    }
}

export default CachePanel;
