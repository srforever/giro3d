const data = new Map();
const stats = new Map();

/**
 * This is a copy of the Map object, except that it also store a value for last
 * time used. This value is used for cache expiration mechanism.
 * <br><br>
 * This module can be imported anywhere, its data will be shared, as it is a
 * single instance.
 *
 * @module Cache
 * @example
 * import Cache from './Cache.js';
 *
 * Cache.set('foo', { bar: 1 }, Cache.POLICIES.TEXTURE);
 * Cache.set('acme', { bar: 32 });
 *
 * Cache.get('foo');
 *
 * Cache.delete('foo');
 *
 * Cache.clear();
 */
const Cache = {
    /**
     * Cache policies for flushing. Those policies can be used when something is
     * [set]{@link Cache.set} into the Cache, as the lifetime property.
     *
     * @name module:Cache
     * @typedef {object} module:Cache.POLICIES
     * @property {number} INFINITE - The entry is never flushed, except when the
     * <code>all</code> flag is set to <code>true</code> when calling {@link
     * Cache.flush}.
     * @property {number} TEXTURE - Shortcut for texture resources. Time is 15 minutes.
     * @property {number} ELEVATION - Shortcut for elevation resources. Time is 15
     * minutes.
     */
    POLICIES: {
        INFINITE: Infinity,
        TEXTURE: 900000,
        ELEVATION: 900000,
    },

    /**
     * Returns the entry related to the specified key from the cache. The last
     * time used property of the entry is updated to extend the longevity of the
     * entry.
     *
     * @name module:Cache.get
     * @param {string} key the entry to get
     * @returns {object} the queried entry, or undefined if not found
     */
    get: key => {
        const entry = data.get(key);
        if (!stats.has(key)) {
            stats.set(key, { hit: 0, miss: 0 });
        }
        const stat = stats.get(key);

        if (entry) {
            stat.hit++;
            entry.lastTimeUsed = Date.now();
            return entry.value;
        }

        stat.miss++;
        return undefined;
    },

    /**
     * Adds or updates an entry with a specified key. A lifetime can be added,
     * by specifying a numerical value or using the {@link Cache.POLICIES}
     * values. By default an entry has an infinite lifetime.
     *
     * @name module:Cache.set
     * @param {string} key the entry key to query
     * @param {object} value the entry value
     * @param {number} [lifetime] the lifetime of this entry, in milliseconds
     * @returns {object} the added value
     */
    set: (key, value, lifetime = Infinity) => {
        const entry = {
            value,
            lastTimeUsed: Date.now(),
            lifetime,
        };
        data.set(key, entry);

        return value;
    },

    deletePrefix: prefix => {
        for (const key of data.keys()) {
            if (key.startsWith && key.startsWith(prefix)) {
                data.delete(key);
            }
        }
    },
    /**
     * Deletes the specified entry from the cache.
     *
     * @name module:Cache.delete
     * @param {string} key the entry key
     * @returns {boolean} - Confirmation that the entry has been deleted.
     */
    delete: key => data.delete(key),

    /**
     * Removes all entries of the cache.
     *
     * @name module:Cache.clear
     * @function
     */
    clear: () => data.clear(),

    /**
     * Flush the cache: entries that have been present for too long since the
     * last time they were used, are removed from the cache. By default, the
     * time is the current time, but the interval can be reduced by doing
     * something like <code>Cache.flush(Date.now() - reductionTime)</code>. If
     * you want to clear the whole cache, use {@link Cache.clear} instead.
     *
     * @name module:Cache.flush
     * @param {number} [time] the timestamp to compare the lifetime of the entries
     * @returns {object} Statistics about the flush: <code>before</code>
     * gives the number of entries before flushing, <code>after</code> the
     * number after flushing, <code>hit</code> the number of total successful
     * hit on resources in the cache, and </code>miss</code> the number of
     * failed hit. The hit and miss are based since the last flush, and are
     * reset on every flush.
     */
    flush: (time = Date.now()) => {
        const before = data.size;

        data.forEach((entry, key) => {
            if (entry.lifetime < time - entry.lastTimeUsed) {
                data.delete(key);
            }
        });

        let hit = 0;
        let miss = 0;
        stats.forEach(stat => {
            hit += stat.hit;
            miss += stat.miss;
        });
        stats.clear();

        return {
            before, after: data.size, hit, miss,
        };
    },
};

Object.freeze(Cache);
export default Cache;
