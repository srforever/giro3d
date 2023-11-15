import Fetcher from '../../../src/utils/Fetcher';
import HttpConfiguration from '../../../src/utils/HttpConfiguration';
import TextureGenerator from '../../../src/utils/TextureGenerator';

describe('Fetcher', () => {
    beforeAll(() => {
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        window.Request = function Request(input: RequestInfo | URL, init?: RequestInit) {
            this.url = input;
        };
    });
    afterEach(() => {
        delete global.fetch;
        // @ts-ignore
        Fetcher._eventTarget._listeners = {};
    });

    describe('FetcherEventDispatcher', () => {
        it('should register & unregister listeners', async () => {
            let events = 0;
            const mycallback = jest.fn(() => {
                events += 1;
            });

            expect(Fetcher.hasEventListener('error', mycallback)).toBe(false);
            Fetcher._eventTarget.dispatchEvent({ type: 'error', error: new Error('Foo') });
            expect(mycallback).not.toBeCalled();
            expect(events).toBe(0);

            Fetcher.addEventListener('error', mycallback);
            expect(Fetcher.hasEventListener('error', mycallback)).toBe(true);
            Fetcher._eventTarget.dispatchEvent({ type: 'error', error: new Error('Foo') });
            expect(mycallback).toBeCalledTimes(1);
            expect(events).toBe(1);
            Fetcher._eventTarget.dispatchEvent({ type: 'error', error: new Error('Foo') });
            expect(mycallback).toBeCalledTimes(2);
            expect(events).toBe(2);

            Fetcher.removeEventListener('error', mycallback);
            expect(Fetcher.hasEventListener('error', mycallback)).toBe(false);
            expect(mycallback).toBeCalledTimes(2);
            expect(events).toBe(2);
        });
    });

    describe('fetch', () => {
        it('should pass the request to the Fetch API', async () => {
            global.fetch = jest.fn(() => Promise.resolve({ ok: true })) as jest.Mock;

            await expect(Fetcher.fetch('http://example.com')).resolves.toEqual({ ok: true });

            expect(global.fetch).toHaveBeenCalled();
        });

        it('should pass the request to the HttpConfiguration', async () => {
            global.fetch = jest.fn(() => Promise.resolve({ ok: true })) as jest.Mock;

            HttpConfiguration.applyConfiguration = jest.fn();

            const opts = { headers: { foo: 'bar' } };
            await expect(Fetcher.fetch('http://example.com', opts)).resolves.toEqual({ ok: true });

            expect(HttpConfiguration.applyConfiguration).toHaveBeenCalledWith('http://example.com', opts);
        });
    });

    describe('blob', () => {
        it('should pass the request to the Fetch API', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                blob: () => Promise.resolve(new Blob([])),
            })) as jest.Mock;

            await expect(Fetcher.blob('http://example.com')).resolves.toBeInstanceOf(Blob);

            expect(global.fetch).toHaveBeenCalled();
        });

        it('decoding errors should not be captured', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                blob: () => Promise.reject(new Error('error decoding blob')),
            })) as jest.Mock;

            let events = 0;
            Fetcher.addEventListener('error', () => {
                events += 1;
            });

            await expect(Fetcher.blob('http://example.com')).rejects.toThrow('error decoding blob');
            expect(events).toBe(0);
        });
    });

    describe('text', () => {
        it('should pass the request to the Fetch API', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                text: () => Promise.resolve('Foo'),
            })) as jest.Mock;

            await expect(Fetcher.text('http://example.com')).resolves.toEqual('Foo');

            expect(global.fetch).toHaveBeenCalled();
        });

        it('decoding errors should not be captured', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                text: () => Promise.reject(new Error('error decoding text')),
            })) as jest.Mock;

            let events = 0;
            Fetcher.addEventListener('error', () => {
                events += 1;
            });

            await expect(Fetcher.text('http://example.com')).rejects.toThrow('error decoding text');
            expect(events).toBe(0);
        });
    });

    describe('json', () => {
        it('should pass the request to the Fetch API', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve(JSON.parse('{"foo": "bar"}')),
            })) as jest.Mock;

            await expect(Fetcher.json('http://example.com')).resolves.toEqual({ foo: 'bar' });

            expect(global.fetch).toHaveBeenCalled();
        });

        it('decoding errors should not be captured', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                json: () => Promise.reject(new Error('error decoding json')),
            })) as jest.Mock;

            let events = 0;
            Fetcher.addEventListener('error', () => {
                events += 1;
            });

            await expect(Fetcher.json('http://example.com')).rejects.toThrow('error decoding json');
            expect(events).toBe(0);
        });
    });

    describe('xml', () => {
        it('should pass the request to the Fetch API', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                text: () => Promise.resolve('<foo>bar</foo>'),
            })) as jest.Mock;

            await expect(Fetcher.xml('http://example.com')).resolves.toBeInstanceOf(Document);

            expect(global.fetch).toHaveBeenCalled();
        });

        it('decoding errors should not be captured', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                text: () => Promise.reject(new Error('error decoding text')),
            })) as jest.Mock;

            let events = 0;
            Fetcher.addEventListener('error', () => {
                events += 1;
            });

            await expect(Fetcher.xml('http://example.com')).rejects.toThrow('error decoding text');
            expect(events).toBe(0);
        });
    });

    describe('arrayBuffer', () => {
        it('should pass the request to the Fetch API', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
            })) as jest.Mock;

            await expect(Fetcher.arrayBuffer('http://example.com')).resolves.toBeInstanceOf(ArrayBuffer);

            expect(global.fetch).toHaveBeenCalled();
        });

        it('decoding errors should not be captured', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                arrayBuffer: () => Promise.reject(new Error('error decoding arrayBuffer')),
            })) as jest.Mock;

            let events = 0;
            Fetcher.addEventListener('error', () => {
                events += 1;
            });

            await expect(Fetcher.arrayBuffer('http://example.com')).rejects.toThrow('error decoding arrayBuffer');
            expect(events).toBe(0);
        });
    });

    describe('texture', () => {
        beforeEach(() => {
            TextureGenerator.decodeBlob = jest.fn(() => Promise.resolve('Bar')) as jest.Mock;
        });

        it('should pass the request to the Fetch API', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                blob: () => Promise.resolve('Foo'),
            })) as jest.Mock;

            await expect(Fetcher.texture('http://example.com')).resolves.toBe('Bar');

            expect(global.fetch).toHaveBeenCalled();
            expect(TextureGenerator.decodeBlob).toBeCalledWith('Foo');
        });

        it('decoding errors should not be captured', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                blob: () => Promise.reject(new Error('error decoding blob')),
            })) as jest.Mock;

            let events = 0;
            Fetcher.addEventListener('error', () => {
                events += 1;
            });

            await expect(Fetcher.texture('http://example.com')).rejects.toThrow('error decoding blob');
            expect(events).toBe(0);
        });
    });

    describe.each([
        Fetcher.fetch,
        Fetcher.blob,
        Fetcher.text,
        Fetcher.json,
        Fetcher.xml,
        Fetcher.arrayBuffer,
        Fetcher.texture,
    ])('%p', func => {
        test('should throw if the response is not HTTP Code 2XX', async () => {
            expect.assertions(3);

            global.fetch = jest.fn(() => Promise.resolve({
                ok: false,
                status: 404,
                statusText: 'Not found',
                url: 'my url',
            })) as jest.Mock;
            let events = 0;
            Fetcher.addEventListener('error', e => {
                expect(e.error.message).toMatch(/404 Not found - my url/);
                events += 1;
            });

            await expect(func('http://example.com')).rejects.toThrow('404 Not found - my url');
            expect(events).toBe(1);
        });

        test('should throw if fetch fails', async () => {
            expect.assertions(3);

            global.fetch = jest.fn(() => Promise.reject(new Error('My network error')));
            let events = 0;
            Fetcher.addEventListener('error', e => {
                expect(e.error.message).toMatch(/My network error/);
                events += 1;
            });

            await expect(func('http://example.com')).rejects.toThrow('My network error');
            expect(events).toBe(1);
        });
    });
});
