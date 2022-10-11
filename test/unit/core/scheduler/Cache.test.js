import Cache from '../../../../src/Core/Scheduler/Cache.js';

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

        it('should honor the specified lifetime', () => {
            now = 0;
            Cache.set('foo', 1, 150);

            now = 200;
            Cache.flush();
            expect(Cache.get('foo')).toBeUndefined();
        });
    });

    describe('deletePrefix', () => {
        it('should remove all entries that share the same prefix as key', () => {
            const A = 'foo';
            const B = 'bar';

            Cache.set(`${A}-1`, 1);
            Cache.set(`${A}-2`, 2);
            Cache.set(`${A}-3`, 3);

            Cache.set(`${B}-4`, 4);
            Cache.set(`${B}-5`, 5);

            Cache.deletePrefix(A);
            expect(Cache.get(`${A}-1`)).toBeUndefined();
            expect(Cache.get(`${A}-2`)).toBeUndefined();
            expect(Cache.get(`${A}-3`)).toBeUndefined();
            expect(Cache.get(`${B}-4`)).toEqual(4);
            expect(Cache.get(`${B}-5`)).toEqual(5);

            Cache.deletePrefix(B);
            expect(Cache.get(`${A}-1`)).toBeUndefined();
            expect(Cache.get(`${A}-2`)).toBeUndefined();
            expect(Cache.get(`${A}-3`)).toBeUndefined();
            expect(Cache.get(`${B}-4`)).toBeUndefined();
            expect(Cache.get(`${B}-5`)).toBeUndefined();
        });
    });
});
