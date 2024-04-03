import { Fetcher, PromiseUtils } from '../utils';
import type { FetchOptions } from '../utils/Fetcher';

/**
 * The cached result of a shared fetch request.
 */
export type FetchResult = {
    cachedBlob: Blob;
    ok: boolean;
    status: number;
    statusText: string;
};

type RequestData = {
    abortController: AbortController;
    signals: AbortSignal[];
    promise: Promise<FetchResult>;
};

export type FetchCallback = (url: string, options?: FetchOptions) => Promise<Response>;

/**
 * Helper class to deduplicate concurrent HTTP requests on the same URLs.
 *
 * The main use case is to be able to handle complex cancellation scenarios when a given request
 * can be "owned" by multiple `AbortSignal`s.
 *
 * ### Deduplication
 *
 * The first time a `fetch` request is called for a given URL, the request is actually started.
 * But subsequent calls to `fetch()` will always return the promise of the first call, as long
 * as the first call is still active. In other word, as soon as the request completes, it is removed
 * from the internal cache.
 *
 * ### Cancellation support
 *
 * All subsequent calls to `fetch()` will attach their own `AbortSignal` to the existing request.
 * When _all_ signals for a given request are aborted, then the request is aborted.
 */
export default class ConcurrentDownloader {
    private readonly _requests: Map<string, RequestData> = new Map();
    private readonly _timeout: number;
    private readonly _retry: number;
    private readonly _fetch: FetchCallback;

    constructor(options: {
        /**
         * The timeout, in milliseconds, before a running request is aborted.
         * @defaultValue 5000
         */
        timeout?: number;
        /**
         * The number of retries after receving a non 2XX HTTP code.
         * @defaultValue 3
         */
        retry?: number;
        /**
         * The fetch function to use.
         * @defaultValue {@link Fetcher.fetch}
         */
        fetch?: FetchCallback;
    }) {
        this._timeout = options.timeout ?? 5000;
        this._retry = options.retry ?? 3;
        this._fetch = options.fetch ?? Fetcher.fetch;
    }

    private async fetchOnce(url: string, options?: FetchOptions): Promise<FetchResult> {
        const response = await this._fetch(url, options);

        // Response.blob() cannot be called more than once,
        // so we have to cache it for all requests.
        const cachedBlob = response.ok ? await response.blob() : null;

        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            cachedBlob,
        };
    }

    /**
     * Fetches the resource. If a request to the same URL is already started, returns the promise
     * to the first request instead.
     * @param url - The URL to fetch.
     * @param signal - Optional abort signal. If specified, it will be attached to the existing request.
     * Only when _all_ signals attached to this request are aborted, is the request aborted.
     * @returns A response that can be safely reused across multiple calls.
     */
    fetch(url: string, signal?: AbortSignal): Promise<FetchResult> {
        const existing = this._requests.get(url);

        signal?.addEventListener('abort', () => {
            const current = this._requests.get(url);
            if (current && current.signals.every(s => s.aborted)) {
                current.abortController.abort(PromiseUtils.abortError());
            }
        });

        if (existing) {
            if (signal) {
                existing.signals.push(signal);
            }

            return existing.promise;
        }

        const abortController = new AbortController();

        if (this._timeout) {
            setTimeout(() => abortController.abort('timeout'), this._timeout);
        }

        const data: RequestData = {
            abortController,
            signals: [signal],
            promise: this.fetchOnce(url, {
                signal: abortController.signal,
                retries: this._retry,
            }).finally(() => this._requests.delete(url)),
        };

        this._requests.set(url, data);

        return data.promise;
    }
}
