import HttpConfiguration from '../../../src/utils/HttpConfiguration.js';

describe('HttpConfiguration', () => {
    beforeEach(() => {
        HttpConfiguration.clear();
    });

    describe('setHeader', () => {
        it('should set the correct entry', () => {
            HttpConfiguration.setHeader('https://example.com', 'Authorization', 'Bearer foo');

            const not = 'https://example.org';

            const root = 'https://example.com';
            const foo = 'https://example.com/foo';
            const foobar = 'https://example.com/foo/bar';

            const notOpts = HttpConfiguration.applyConfiguration(not);
            const rootOpts = HttpConfiguration.applyConfiguration(root);
            const fooOpts = HttpConfiguration.applyConfiguration(foo, {});
            const foobarOpts = HttpConfiguration.applyConfiguration(foobar, {});

            expect(notOpts).toBeUndefined();
            expect(rootOpts.headers.Authorization).toEqual('Bearer foo');
            expect(fooOpts.headers.Authorization).toEqual('Bearer foo');
            expect(foobarOpts.headers.Authorization).toEqual('Bearer foo');
        });

        it('should return undefined if no configuration applies and no object is passed', () => {
            const output = HttpConfiguration.applyConfiguration('http://nothing.com');

            expect(output).toBeUndefined();
        });

        it('should return the same object that was passed', () => {
            const inputOpts = {};
            const outputOpts = HttpConfiguration.applyConfiguration('http://nothing.com', inputOpts);

            expect(inputOpts).toBe(outputOpts);
        });

        it('should honor precedence of prefixes', () => {
            HttpConfiguration.setHeader('https://example.com/very/specific/prefix', 'Authorization', 'HIGH');

            HttpConfiguration.setHeader('https://example.com/lower/prefix', 'Authorization', 'LOW');

            const high = 'https://example.com/very/specific/prefix/resource/foo/bar/baz.html';
            const low = 'https://example.com/lower/prefix/some/resource.html';

            const highOpts = HttpConfiguration.applyConfiguration(high, {});
            const lowOpts = HttpConfiguration.applyConfiguration(low, {});

            expect(highOpts.headers.Authorization).toEqual('HIGH');
            expect(lowOpts.headers.Authorization).toEqual('LOW');
        });

        it('should preserve all properties in the passed options', () => {
            const opts = {
                method: 'POST',
                foo: 'bar',
            };

            HttpConfiguration.setHeader('https://example.com', 'Authorization', 'auth');

            HttpConfiguration.applyConfiguration('https://example.com', opts);

            expect(opts.method).toEqual('POST');
            expect(opts.foo).toEqual('bar');
            expect(opts.headers.Authorization).toEqual('auth');
        });

        it('should respect existing configuration without overriding it', () => {
            HttpConfiguration.setHeader('https://example.com', 'Authorization', 'DO_NOT_USE_THIS');

            const opts = {
                headers: {
                    Authorization: 'USE_THIS_INSTEAD',
                },
            };

            HttpConfiguration.applyConfiguration('https://example.com', opts);

            expect(opts.headers.Authorization).toEqual('USE_THIS_INSTEAD');
        });
    });
});
