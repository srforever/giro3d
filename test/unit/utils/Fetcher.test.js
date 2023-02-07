import Fetcher from '../../../src/utils/Fetcher.js';
import HttpConfiguration from '../../../src/utils/HttpConfiguration.js';

describe('Fetcher', () => {
    beforeAll(() => {
        window.Request = function Request(url) {
            this.url = url;
        };
    });

    describe('fetch', () => {
        it('should pass the request to the Fetch API', async () => {
            global.fetch = jest.fn(() => Promise.resolve({ ok: true }));

            await Fetcher.fetch('http://example.com');

            expect(global.fetch).toHaveBeenCalled();
        });

        it('should pass the request to the HttpConfiguration', async () => {
            global.fetch = jest.fn(() => Promise.resolve({ ok: true }));

            HttpConfiguration.applyConfiguration = jest.fn();

            const opts = { headers: { foo: 'bar' } };
            await Fetcher.fetch('http://example.com', opts);

            expect(HttpConfiguration.applyConfiguration).toHaveBeenCalledWith('http://example.com', opts);
        });

        it('should throw if the response is not HTTP Code 2XX', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: false,
                status: 404,
                statusText: 'Not found',
                url: 'my url',
            }));

            return Fetcher.fetch('http://example.com')
                .catch(e => expect(e.message).toMatch(/404 Not found - my url/));
        });
    });
});
