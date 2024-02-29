import { EventDispatcher } from 'three';

function openDb(name: string, storeName: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { autoIncrement: true });
            }
            resolve(db);
        };

        request.onsuccess = () => {
            const db = request.result;
            resolve(db);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

export const DEFAULT_DB_NAME = 'giro3d-cache-ddce6f14-d7d0-11ee-86cb-93b6c44a50ff';
export const DEFAULT_STORE_NAME = 'default';
// This must be incremented when we change the schema of the db.
export const DB_VERSION = 1;

export type ConstructorOptions = {
    /**
     * The database name.
     *
     * @default "giro3d-cache".
     */
    dbName?: string;
    /**
     * The store name.
     *
     * @default "default".
     */
    storeName?: string;
};

interface PersistentCacheEventMap {
    'changed': {};
}

/**
 * A persistent cache that internally uses the [IndexedDB API](https://www.w3.org/TR/IndexedDB/).
 * Note that all read/write operations are asynchronous.
 */
class PersistentCache extends EventDispatcher<PersistentCacheEventMap> {
    private readonly _storeName: string;
    private readonly _dbName: string;
    private _db: IDBDatabase;
    private _enabled: boolean = true;

    /**
     * @param options The options.
     */
    constructor(
        options: ConstructorOptions = {
            dbName: DEFAULT_DB_NAME,
            storeName: DEFAULT_STORE_NAME,
        },
    ) {
        super();
        this._dbName = options.dbName;
        this._storeName = options.storeName;
    }

    get databaseName() {
        return this._dbName;
    }

    get storeName() {
        return this._storeName;
    }

    getInfo(): Promise<{
        dbName: string;
        storeName: string;
        entryCount: number;
        dbVersion: number
    }> {
        return new Promise((resolve, reject) => {
            this.getStore(this.storeName, 'readonly').then(({ db, store }) => {
                const req = store.count();
                req.onsuccess = () => resolve({
                    dbName: db.name,
                    dbVersion: db.version,
                    entryCount: req.result,
                    storeName: store.name,
                });
                req.onerror = () => reject(req.error);
            });
        });
    }

    /**
     * Enables or disable the cache.
     */
    get enabled() {
        return this._enabled;
    }

    set enabled(enable: boolean) {
        this._enabled = enable;
    }

    private async getDb(): Promise<IDBDatabase> {
        if (this._db) {
            return this._db;
        }

        this._db = await openDb(this._dbName, this._storeName);

        return this._db;
    }

    private getStore(
        name: string,
        mode: IDBTransactionMode,
    ): Promise<{ store: IDBObjectStore; db: IDBDatabase }> {
        return new Promise(resolve => {
            this.getDb()
                .then(db => {
                    const tx = db.transaction([name], mode);
                    const store = tx.objectStore(this._storeName);

                    resolve({ store, db });
                })
                .catch(console.error);
        });
    }

    /**
     * Erases all content from the store.
     */
    clear(): Promise<void> {
        return new Promise(resolve => {
            this.getStore(this._storeName, 'readwrite').then(({ store }) => {
                const request = store.clear();
                request.onsuccess = () => {
                    this.dispatchEvent({ type: 'changed' });
                    resolve();
                };
                request.onerror = () => {
                    console.error(request.error);
                };
            });
        });
    }

    /**
     * Gets a stored value.
     *
     * @param key The key.
     * @returns A promise that resolves with the stored value, if any, otherwise, `undefined`.
     */
    get<T = any>(key: IDBValidKey): Promise<T> {
        if (!this._enabled) {
            return Promise.resolve(undefined);
        }

        return new Promise(resolve => {
            this.getStore(this._storeName, 'readonly').then(({ store }) => {
                const request = store.get(key);
                request.onsuccess = () => {
                    resolve(request.result as T);
                };
                request.onerror = () => {
                    console.error(request.error);
                };
            });
        });
    }

    /**
     * Stores a value in the cache.
     *
     * @param key The key.
     * @param value The value.
     * @returns A promise that resolves when the value has been stored, or if an error occurs.
     */
    set(key: IDBValidKey, value: any): Promise<void> {
        if (!this._enabled) {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            this.getStore(this._storeName, 'readwrite').then(({ store }) => {
                const request = store.put(value, key);
                request.onsuccess = () => {
                    this.dispatchEvent({ type: 'changed' });
                    resolve();
                };
                request.onerror = () => {
                    console.error(request.error);
                };
            });
        });
    }
}

/**
 * The default persistent cache.
 */
const DefaultPersistentCache = new PersistentCache();

export { PersistentCache, DefaultPersistentCache };
