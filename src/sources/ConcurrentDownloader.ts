import { Fetcher, PromiseUtils } from '../utils';

type RequestData = {
    abortController: AbortController;
    signals: AbortSignal[];
    promise: Promise<Response>;
};

export default class ConcurrentDownloader {
    private readonly _requests: Map<string, RequestData> = new Map();
    private readonly _timeout: number;

    constructor(options: { timeout: number } = { timeout: 5000 }) {
        this._timeout = options.timeout;
    }

    fetch(url: string, signal: AbortSignal): Promise<Response> {
        const existing = this._requests.get(url);

        signal.addEventListener('abort', () => {
            const current = this._requests.get(url);
            if (current && current.signals.every(s => s.aborted)) {
                current.abortController.abort(PromiseUtils.abortError());
            }
        });

        if (existing) {
            existing.signals.push(signal);

            return existing.promise;
        }

        const abortController = new AbortController();

        if (this._timeout) {
            setTimeout(() => abortController.abort('timeout'), this._timeout);
        }

        const data: RequestData = {
            abortController,
            signals: [signal],
            promise: Fetcher.fetch(url, { signal: abortController.signal }).finally(() =>
                this._requests.delete(url),
            ),
        };

        this._requests.set(url, data);

        return data.promise;
    }
}
