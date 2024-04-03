import type { FetchCallback } from 'src/sources/ConcurrentDownloader';
import ConcurrentDownloader from 'src/sources/ConcurrentDownloader';
import { PromiseUtils } from 'src/utils';

const URL = 'http://example.com/foo';

const response = {
    status: 200,
    statusText: 'ok',
    blob: () => Promise.resolve(new Blob([])),
} as Response;

const defaultFetch: FetchCallback = () => Promise.resolve(response);

describe('fetch', () => {
    it('should return the same reusable response for the same url', async () => {
        const dl = new ConcurrentDownloader({ fetch: defaultFetch });

        const res1 = dl.fetch(URL);
        const res2 = dl.fetch(URL);

        expect(await res1).toBe(await res2);
    });

    it('should handle timeouts', async () => {
        let aggregateSignal: AbortSignal;

        const response = {
            status: 200,
            statusText: 'ok',
            blob: () => Promise.resolve(new Blob([])),
        } as Response;

        const fetch: FetchCallback = (url, options) => {
            aggregateSignal = options.signal;
            return Promise.resolve(response);
        };

        const timeout = 1000;

        const dl = new ConcurrentDownloader({ fetch, timeout });

        dl.fetch(URL);
        dl.fetch(URL);

        expect(aggregateSignal.aborted).toEqual(false);

        await PromiseUtils.delay(timeout * 2);

        expect(aggregateSignal.aborted).toEqual(true);
        expect(aggregateSignal.reason).toEqual('timeout');
    });

    it('should abort the deduplicated request when *all* requests are aborted', () => {
        let aggregateSignal: AbortSignal;

        const response = {
            status: 200,
            statusText: 'ok',
            blob: () => Promise.resolve(new Blob([])),
        } as Response;

        const fetch: FetchCallback = (url, options) => {
            aggregateSignal = options.signal;
            return Promise.resolve(response);
        };

        const dl = new ConcurrentDownloader({ fetch });

        const abort1 = new AbortController();
        const abort2 = new AbortController();
        const abort3 = new AbortController();

        dl.fetch(URL, abort1.signal);
        dl.fetch(URL, abort2.signal);
        dl.fetch(URL, abort3.signal);

        expect(aggregateSignal).not.toBe(abort1.signal);
        expect(aggregateSignal).not.toBe(abort2.signal);
        expect(aggregateSignal).not.toBe(abort3.signal);

        expect(aggregateSignal.aborted).toEqual(false);

        abort1.abort();
        expect(aggregateSignal.aborted).toEqual(false);

        abort2.abort();
        expect(aggregateSignal.aborted).toEqual(false);

        abort3.abort();
        expect(aggregateSignal.aborted).toEqual(true);
        expect(aggregateSignal.reason.name).toEqual('AbortError');
    });
});
