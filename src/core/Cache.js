/** @module core/Cache */

import LRUCache from 'lru-cache';

/**
 * The cache options.
 *
 * @typedef {object} CacheOptions
 * @property {number} [ttl] The time to live of this entry, in milliseconds.
 * @property {number} [size] The entry size, in bytes. It does not have to be an exact value, but
 * it helps the cache determine when to remove entries to save memory.
 * @property {Function} [onDelete] A callback called when the entry is deleted from the cache.
 */

const SECONDS = 1000;

/**
 * The default max number of entries.
 *
 * @api
 * @constant
 * @type {number}
 */
const DEFAULT_MAX_ENTRIES = 8192;

/**
 * The default TTL (time to live).
 *
 * @api
 * @constant
 * @type {number}
 */
const DEFAULT_TTL = 240 * SECONDS;

/**
 * The default capacity, in bytes.
 *
 * @api
 * @constant
 * @type {number}
 */
const DEFAULT_CAPACITY = 512 * 1024 * 1024;

/**
 * The cache.
 *
 * @api
 */
class Cache {
    /**
     * Constructs a cache.
     *
     * @api
     * @param {object} opts The options.
     * @param {number} [opts.ttl=DEFAULT_TTL] The default TTL (time to live) of entries. Can
     * be overriden for each entry.
     * @param {number} [opts.byteCapacity=DEFAULT_CAPACITY] The capacity, in bytes, of the cache.
     * @param {number} [opts.maxNumberOfEntries=DEFAULT_MAX_ENTRIES] The capacity, in number of
     * entries, of the cache.
     */
    constructor(opts = {}) {
        /** @type {Map<string, Function>} */
        this.deleteHandlers = new Map();

        const that = this;
        this._enabled = true;
        this.lru = new LRUCache({
            ttl: opts.ttl ?? DEFAULT_TTL,
            ttlResolution: 1000, // 1 second
            updateAgeOnGet: true,
            maxSize: opts.byteCapacity ?? DEFAULT_CAPACITY,
            max: opts.maxNumberOfEntries ?? DEFAULT_MAX_ENTRIES,
            allowStale: false,
            dispose: (value, key) => {
                that._onDisposed(key, value);
            },
        });
    }

    /**
     * Enables or disables the cache.
     *
     * @api
     * @type {boolean}
     */
    get enabled() {
        return this._enabled;
    }

    set enabled(v) {
        this._enabled = v;
    }

    /**
     * Gets or sets the default TTL (time to live) of the cache.
     *
     * @api
     * @type {number}
     */
    get defaultTtl() {
        return this.lru.ttl;
    }

    set defaultTtl(v) {
        this.lru.ttl = v;
    }

    /**
     * Gets or sets the maximum size of the cache, in bytes.
     *
     * @api
     * @type {number}
     */
    get maxSize() {
        return this.lru.maxSize;
    }

    set maxSize(v) {
        this.lru.maxSize = v;
    }

    /**
     * Gets or sets the mximum number of entries.
     *
     * @api
     * @type {number}
     */
    get capacity() {
        return this.lru.max;
    }

    set capacity(v) {
        this.lru.max = v;
    }

    /**
     * Gets the number of entries.
     *
     * @api
     * @type {number}
     */
    get count() {
        return this.lru.size;
    }

    /**
     * Gets the size of entries, in bytes
     *
     * @api
     * @type {number}
     */
    get size() {
        return this.lru.calculatedSize;
    }

    /**
     * Returns an array of entries.
     *
     * @api
     * @returns {Array} The entries.
     */
    entries() {
        return [...this.lru.entries()];
    }

    _onDisposed(key, value) {
        /** @type {Function} */
        const handler = this.deleteHandlers.get(key);
        if (handler) {
            this.deleteHandlers.delete(key);
            handler(value);
        }
    }

    /**
     * Removes stale entries.
     *
     * @api
     */
    purge() {
        this.lru.purgeStale();
    }

    /**
     * Returns the entry with the specified key, or `undefined` if no entry matches this key.
     *
     * @api
     * @param {string} key The entry key.
     * @returns {any|undefined} The entry, or `undefined`.
     */
    get(key) {
        if (!this.enabled) {
            return undefined;
        }

        return this.lru.get(key);
    }

    /**
     * Stores an entry in the cache, or replaces an existing entry with the same key.
     *
     * @api
     * @param {string} key The key.
     * @param {any} value The value.
     * @param {CacheOptions} [options] The options.
     */
    set(key, value, options = {}) {
        if (!this.enabled) {
            return value;
        }

        if (typeof key !== 'string') {
            throw new Error('the cache expects strings as keys.');
        }

        this.lru.set(key, value, {
            ttl: options.ttl ?? this.defaultTtl,
            size: options.size ?? 1024, // Use a default size if not provided
        });

        if (options.onDelete) {
            this.deleteHandlers.set(key, options.onDelete);
        }

        return value;
    }

    /**
     * Deletes an entry.
     *
     * @api
     * @param {string} key The key.
     * @returns {boolean} `true` if the entry was deleted, `false` otherwise.
     */
    delete(key) {
        return this.lru.delete(key);
    }

    /**
     * Clears the cache.
     *
     * @api
     */
    clear() {
        this.lru.clear();
    }
}

/**
 * A global singleton cache.
 *
 * @api
 * @type {Cache}
 */
const GlobalCache = new Cache();

export {
    GlobalCache,
    Cache,
    DEFAULT_TTL,
    DEFAULT_CAPACITY,
    DEFAULT_MAX_ENTRIES,
};
