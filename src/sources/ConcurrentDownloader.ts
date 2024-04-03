import { Fetcher, PromiseUtils } from '../utils';

type RequestData = {
    abortController: AbortController;
    signals: AbortSignal[];
    promise: Promise<Response>;
};

export default class ConcurrentDownloader {
    private readonly _requests: Map<string, RequestData> = new Map();
    private readonly _timeout: number;
    private readonly _retry: number;

    constructor(options: { timeout: number; retry?: number } = { timeout: 5000, retry: 3 }) {
        this._timeout = options.timeout;
        this._retry = options.retry;
    }

    fetch(url: string, signal: AbortSignal): Promise<Response> {
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
            promise: Fetcher.fetch(url, {
                signal: abortController.signal,
                retries: this._retry,
            }).finally(() => this._requests.delete(url)),
        };

        this._requests.set(url, data);

        return data.promise;
    }
}
