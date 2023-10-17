import { Cache } from '../../../../src/core/Cache';

let now = 0;
/** @type {Cache} */
let cache;

describe('Cache', () => {
    beforeEach(() => {
        performance.now = () => now;
        cache = new Cache();
    });

    describe('clear()', () => {
        it('should remove all entries', () => {
            cache.set('foo', 1);
            cache.set('bar', 2);

            cache.clear();

            expect(cache.get('foo')).toBeUndefined();
            expect(cache.get('bar')).toBeUndefined();
        });

        it('should call the onDelete callback on compatible entries', () => {
            const onDelete1 = jest.fn();
            const onDelete2 = jest.fn();

            cache.set('foo', 1, { ttl: 0, onDelete: onDelete1 });
            cache.set('bar', 2);
            cache.set('baz', 3, { ttl: 0, onDelete: onDelete2 });

            cache.clear();

            expect(cache.get('foo')).toBeUndefined();
            expect(cache.get('bar')).toBeUndefined();
            expect(cache.get('baz')).toBeUndefined();

            expect(onDelete1).toHaveBeenCalledTimes(1);
            expect(onDelete2).toHaveBeenCalledTimes(1);
        });
    });

    describe('delete', () => {
        it('should do nothing if the key is not present', () => {
            expect(() => cache.delete('nope')).not.toThrow();
        });

        it('should remove the entry if the key is present', () => {
            cache.set('foo', 1);
            cache.delete('foo');
            expect(cache.get('foo')).toBeUndefined();
        });

        it('should call the onDelete callback if present', () => {
            const onDelete = jest.fn();
            cache.set('foo', 1, { onDelete });
            cache.delete('foo');
            expect(cache.get('foo')).toBeUndefined();
            expect(onDelete).toHaveBeenCalledTimes(1);
        });
    });

    describe('enable', () => {
        it('should enable/disable getting/setting entries', () => {
            cache.set('foo', 1);
            cache.enabled = false;
            expect(cache.get('foo')).toBeUndefined();

            cache.set('bar', 4);
            cache.enabled = true;
            expect(cache.get('bar')).toBeUndefined();
        });
    });

    describe('set', () => {
        it('should add the entry if not present', () => {
            cache.set('foo', 1);
            expect(cache.get('foo')).toEqual(1);
        });

        it('should replace an existing entry with the same key', () => {
            cache.set('foo', 1);
            cache.set('foo', 2);

            expect(cache.get('foo')).toEqual(2);
        });

        it('should call onDelete on the replaced entry', () => {
            const onDelete1 = jest.fn();
            const onDelete2 = jest.fn();

            cache.set('foo', 1, { ttl: 0, onDelete: onDelete1 });
            cache.set('foo', 2, { ttl: 0, onDelete: onDelete2 });

            expect(cache.get('foo')).toEqual(2);
            expect(onDelete1).toHaveBeenCalledTimes(1);
            expect(onDelete2).not.toHaveBeenCalled();
        });

        it('should honor the specified lifetime', () => {
            now = 12;
            cache.set('foo', 1, { ttl: 150 });

            now = 200;
            expect(cache.get('foo')).toBeUndefined();
        });

        it('should call onDelete on expired entries', () => {
            now = 12;
            const onDelete = jest.fn();
            cache.set('foo', 1, { ttl: 150, onDelete });

            now = 200;
            expect(cache.get('foo')).toBeUndefined();
            expect(onDelete).toHaveBeenCalledTimes(1);
        });

        it('should return the entry, even if cache is disabled', () => {
            const obj = { foo: 3 };
            expect(cache.set('whatever', obj)).toBe(obj);

            cache.enabled = false;
            expect(cache.set('whatever2', obj)).toBe(obj);
        });
    });
});
