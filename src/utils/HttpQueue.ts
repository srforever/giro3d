const DEFAULT_CONCURRENT_REQUESTS = 10;

interface Task {
    req: Request,
    resolve: Function,
    reject: Function
}

/**
 * A simple HTTP queue that guarantees an upper bound to the number of concurrent requests.
 * This avoids exhausting the resources of the browser without any additional burden on the
 * emitters of the requests.
 */
class HttpQueue {
    private readonly maxConcurrentRequests: number;
    private readonly queue: Task[];
    private _concurrentRequests: number;

    /**
     * @param options Options.
     * @param options.maxConcurrentRequests Max concurrent requests for this host.
     */
    constructor(options : {
        maxConcurrentRequests?: number;
    } = {
        maxConcurrentRequests: DEFAULT_CONCURRENT_REQUESTS,
    }) {
        this.maxConcurrentRequests = options.maxConcurrentRequests;
        this._concurrentRequests = 0;
        this.queue = [];
    }

    get concurrentRequests() : number {
        return this._concurrentRequests;
    }

    /**
     * Returns the size of the queue.
     */
    get size() {
        return this.queue.length;
    }

    /**
     * Checks if new requests can be executed.
     */
    private checkQueue() {
        if (this.queue.length > 0 && this._concurrentRequests < this.maxConcurrentRequests) {
            const diff = this.maxConcurrentRequests - this._concurrentRequests;
            const count = Math.min(this.queue.length, diff);

            const requests = this.queue.splice(0, count);
            this._concurrentRequests += requests.length;

            requests.forEach(item => {
                this.execute(item);
            });
        }
    }

    /**
     * Execute the request immediately.
     *
     * @param task The task.
     * @param task.req The request.
     * @param task.resolve The resolve() function when the request is successful.
     * @param task.reject The reject() functionwhen the request failed.
     */
    private async execute(task: Task) {
        const { req, resolve, reject } = task;

        try {
            req.signal?.throwIfAborted();
            const res = await fetch(req);
            resolve(res);
        } catch (e) {
            reject(e);
        } finally {
            this._concurrentRequests--;
            this.checkQueue();
        }
    }

    /**
     * @param req The HTTP request.
     * @returns The response.
     */
    public enqueue(req: Request): Promise<Response> {
        return new Promise((resolve, reject) => {
            this.queue.push({ req, resolve, reject });
            this.checkQueue();
        });
    }
}

export default HttpQueue;
