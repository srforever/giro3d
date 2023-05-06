const DEFAULT_CONCURRENT_REQUESTS = 10;

/**
 * A simple HTTP queue that guarantees an upper bound to the number of concurrent requests.
 */
class HttpQueue {
    /**
     * @param {object} options Options.
     * @param {number} [options.maxConcurrentRequests=6] Max concurrent requests for this host.
     */
    constructor(options = {}) {
        this.maxConcurrentRequests = options.maxConcurrentRequests ?? DEFAULT_CONCURRENT_REQUESTS;
        this.concurrentRequests = 0;
        /**
         * @type {Array<{ req: Request, resolve: Function, reject: Function}>}
         */
        this.queue = [];
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
    checkQueue() {
        if (this.queue.length > 0 && this.concurrentRequests < this.maxConcurrentRequests) {
            const diff = this.maxConcurrentRequests - this.concurrentRequests;
            const count = Math.min(this.queue.length, diff);

            const requests = this.queue.splice(0, count);
            this.concurrentRequests += requests.length;

            requests.forEach(item => {
                this.execute(item);
            });
        }
    }

    /**
     * Execute the request immediately.
     *
     * @param {{ req: Request, resolve: Function, reject: Function}} req The request.
     * @returns {Promise<Response>} The response.
     */
    async execute({ req, resolve, reject }) {
        try {
            req.signal?.throwIfAborted();
            const res = await fetch(req);
            resolve(res);
        } catch (e) {
            reject(e);
        } finally {
            this.concurrentRequests--;
            this.checkQueue();
        }
    }

    /**
     * @param {Request} req The HTTP request.
     * @returns {Promise<Response>} The response.
     */
    enqueue(req) {
        return new Promise((resolve, reject) => {
            this.queue.push({ req, resolve, reject });
            this.checkQueue();
        });
    }
}

export default HttpQueue;
