import Cache from '../../../../src/core/scheduler/Cache.js';

let now = 0;

const nowFunc = () => now;

describe('Cache', () => {
    beforeEach(() => {
        Cache.setTimeFunction(nowFunc);
    });

    describe('clear()', () => {
        it('should remove all entries', () => {
            Cache.set('foo', 1);
            Cache.set('bar', 2);

            Cache.clear();

            expect(Cache.get('foo')).toBeUndefined();
            expect(Cache.get('bar')).toBeUndefined();
        });

        it('should call the onDelete callback on compatible entries', () => {
            const onDelete1 = jest.fn();
            const onDelete2 = jest.fn();

            Cache.set('foo', 1, 0, onDelete1);
            Cache.set('bar', 2);
            Cache.set('baz', 3, 0, onDelete2);

            Cache.clear();

            expect(Cache.get('foo')).toBeUndefined();
            expect(Cache.get('bar')).toBeUndefined();
            expect(Cache.get('baz')).toBeUndefined();

            expect(onDelete1).toHaveBeenCalledTimes(1);
            expect(onDelete2).toHaveBeenCalledTimes(1);
        });
    });

    describe('delete', () => {
        it('should do nothing if the key is not present', () => {
            expect(() => Cache.delete('nope')).not.toThrow();
        });

        it('should remove the entry if the key is present', () => {
            Cache.set('foo', 1);
            Cache.delete('foo');
            expect(Cache.get('foo')).toBeUndefined();
        });

        it('should call the onDelete callback if present', () => {
            const onDelete = jest.fn();
            Cache.set('foo', 1, 0, onDelete);
            Cache.delete('foo');
            expect(Cache.get('foo')).toBeUndefined();
            expect(onDelete).toHaveBeenCalledTimes(1);
        });
    });

    describe('set', () => {
        it('should add the entry if not present', () => {
            Cache.set('foo', 1);
            expect(Cache.get('foo')).toEqual(1);
        });

        it('should replace an existing entry with the same key', () => {
            Cache.set('foo', 1);
            Cache.set('foo', 2);

            expect(Cache.get('foo')).toEqual(2);
        });

        it('should call onDelete on the replaced entry', () => {
            const onDelete1 = jest.fn();
            const onDelete2 = jest.fn();

            Cache.set('foo', 1, 0, onDelete1);
            Cache.set('foo', 2, 0, onDelete2);

            expect(Cache.get('foo')).toEqual(2);
            expect(onDelete1).toHaveBeenCalledTimes(1);
            expect(onDelete2).not.toHaveBeenCalled();
        });

        it('should honor the specified lifetime', () => {
            now = 0;
            Cache.set('foo', 1, 150);

            now = 200;
            Cache.flush();
            expect(Cache.get('foo')).toBeUndefined();
        });

        it('should call onDelete on expired entries', () => {
            now = 0;
            const onDelete = jest.fn();
            Cache.set('foo', 1, 150, onDelete);

            now = 200;
            Cache.flush();
            expect(Cache.get('foo')).toBeUndefined();
            expect(onDelete).toHaveBeenCalledTimes(1);
        });
    });

    describe('deletePrefix', () => {
        it('should remove all entries that share the same prefix as key', () => {
            const A = 'foo';
            const B = 'bar';

            const onDeleteA1 = jest.fn();
            const onDeleteA2 = jest.fn();
            const onDeleteA3 = jest.fn();
            const onDeleteB4 = jest.fn();
            const onDeleteB5 = jest.fn();

            const lifetime = Infinity;

            Cache.set(`${A}-1`, 1, lifetime, onDeleteA1);
            Cache.set(`${A}-2`, 2, lifetime, onDeleteA2);
            Cache.set(`${A}-3`, 3, lifetime, onDeleteA3);

            Cache.set(`${B}-4`, 4, lifetime, onDeleteB4);
            Cache.set(`${B}-5`, 5, lifetime, onDeleteB5);

            Cache.deletePrefix(A);
            expect(Cache.get(`${A}-1`)).toBeUndefined();
            expect(Cache.get(`${A}-2`)).toBeUndefined();
            expect(Cache.get(`${A}-3`)).toBeUndefined();
            expect(Cache.get(`${B}-4`)).toEqual(4);
            expect(Cache.get(`${B}-5`)).toEqual(5);

            expect(onDeleteA1).toHaveBeenCalledTimes(1);
            expect(onDeleteA2).toHaveBeenCalledTimes(1);
            expect(onDeleteA3).toHaveBeenCalledTimes(1);
            expect(onDeleteB4).not.toHaveBeenCalledTimes(1);
            expect(onDeleteB5).not.toHaveBeenCalledTimes(1);

            Cache.deletePrefix(B);
            expect(Cache.get(`${A}-1`)).toBeUndefined();
            expect(Cache.get(`${A}-2`)).toBeUndefined();
            expect(Cache.get(`${A}-3`)).toBeUndefined();
            expect(Cache.get(`${B}-4`)).toBeUndefined();
            expect(Cache.get(`${B}-5`)).toBeUndefined();

            expect(onDeleteA1).toHaveBeenCalledTimes(1);
            expect(onDeleteA2).toHaveBeenCalledTimes(1);
            expect(onDeleteA3).toHaveBeenCalledTimes(1);
            expect(onDeleteB4).toHaveBeenCalledTimes(1);
            expect(onDeleteB5).toHaveBeenCalledTimes(1);
        });
    });
});
