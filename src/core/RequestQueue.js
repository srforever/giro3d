import PriorityQueue from 'ol/structs/PriorityQueue.js';
import OperationCounter from './OperationCounter.js';
import PromiseUtils from '../utils/PromiseUtils.js';

function priorityFn(task) {
    return task.getPriority();
}

function keyFn(task) {
    return task.getKey();
}

function defaultShouldExecute() {
    return true;
}

class Task {
    constructor(id, signal, priority, request, resolve, reject, shouldExecute) {
        this.id = id;
        this.priority = priority;
        this.signal = signal;
        this.resolve = resolve;
        this.reject = reject;
        /** @type {function(()):Promise} */
        this.request = request;
        this.shouldExecute = shouldExecute ?? defaultShouldExecute;
    }

    getKey() {
        return this.id;
    }

    getPriority() {
        if (this.signal?.aborted) {
            // means "drop the request"
            return Infinity;
        }

        return this.priority;
    }

    execute() {
        if (this.signal?.aborted) {
            this.reject(PromiseUtils.abortError());
            return Promise.reject();
        }

        return this.request()
            .then(x => this.resolve(x))
            .catch(e => this.reject(e));
    }
}

const MAX_CONCURRENT_REQUESTS = 10;

/**
 * A generic priority queue that ensures that the same request cannot be added twice in the queue.
 */
class RequestQueue {
    /**
     * @param {object} options Options.
     * @param {number} [options.maxConcurrentRequests] The maximum number of concurrent requests.
     */
    constructor(options = {}) {
        /** @type {Map<string, Promise>} */
        this.pendingIds = new Map();
        this.queue = new PriorityQueue(priorityFn, keyFn);
        this.opCounter = new OperationCounter();
        this.concurrentRequests = 0;
        this.maxConcurrentRequests = options.maxConcurrentRequests ?? MAX_CONCURRENT_REQUESTS;
    }

    get progress() {
        return this.opCounter.progress;
    }

    get loading() {
        return this.opCounter.loading;
    }

    onQueueAvailable() {
        if (this.queue.isEmpty()) {
            return;
        }

        while (this.concurrentRequests < this.maxConcurrentRequests) {
            if (this.queue.isEmpty()) {
                break;
            }

            /** @type {Task} */
            const task = this.queue.dequeue();
            const key = task.getKey();

            if (task.shouldExecute()) {
                this.concurrentRequests++;
                task.execute().finally(() => {
                    this.opCounter.decrement();
                    this.pendingIds.delete(key);
                    this.concurrentRequests--;
                    this.onQueueAvailable();
                });
            } else {
                this.opCounter.decrement();
                this.pendingIds.delete(key);
                this.onQueueAvailable();
                task.reject(PromiseUtils.abortError());
            }
        }
    }

    /**
     * Enqueues a request. If a request with the same id is currently in the queue, then returns
     * the promise associated with the existing request.
     *
     * @param {object} options Options.
     * @param {string} options.id The unique identifier of this request.
     * @param {function(()):Promise} options.request The request.
     * @param {function(string):boolean} [options.shouldExecute] The optional filter function used
     * to discard a task: if the function returns `false`, the task is not executed.
     * @param {AbortSignal} [options.signal] The abort signal.
     * @param {number} options.priority The priority of this request.
     * @returns {Promise} A promise that resolves when the requested is completed.
     */
    enqueue({
        id, request, signal, priority, shouldExecute,
    }) {
        if (signal?.aborted) {
            return Promise.reject(PromiseUtils.abortError());
        }

        if (this.pendingIds.has(id)) {
            return this.pendingIds.get(id);
        }

        this.opCounter.increment();

        const promise = new Promise((resolve, reject) => {
            const task = new Task(id, signal, priority, request, resolve, reject, shouldExecute);
            if (this.queue.isEmpty()) {
                this.queue.enqueue(task);
                this.onQueueAvailable();
            } else {
                this.queue.enqueue(task);
            }
        });
        this.pendingIds.set(id, promise);

        return promise;
    }
}

/**
 * A global singleton queue.
 *
 * @api
 * @type {RequestQueue}
 */
const DefaultQueue = new RequestQueue();

export { DefaultQueue };

export default RequestQueue;
