// eslint-disable-next-line import/no-named-as-default
import type GUI from 'lil-gui';
import Panel from './Panel';
import type Instance from '../core/Instance';
import type { PersistentCache } from '../core/PersistentCache';
import { DefaultPersistentCache } from '../core/PersistentCache';

class PersistentCachePanel extends Panel {
    private readonly _cache: PersistentCache = DefaultPersistentCache;

    entryCount: number = -1;
    dbVersion: number = -1;

    constructor(parentGui: GUI, instance: Instance) {
        super(parentGui, instance, 'Persistent cache');

        this._cache.addEventListener('changed', () => this.updateAsyncValues());

        this.addController<boolean>(this._cache, 'enabled').name('Enable cache');
        this.addController<never>(this, 'clear').name('Clear the cache');
        this.addController<string>(this._cache, 'databaseName').name('Db name');
        this.addController<number>(this, 'dbVersion').name('Db version');
        this.addController<string>(this._cache, 'storeName').name('Object store name');
        this.addController<number>(this, 'entryCount').name('Entry count');

        this.updateAsyncValues();
    }

    private updateAsyncValues() {
        this._cache.getInfo().then(info => {
            this.entryCount = info.entryCount;
            this.dbVersion = info.dbVersion;
        });
    }

    async clear() {
        await this._cache.clear();

        this.updateAsyncValues();
    }
}

export default PersistentCachePanel;
