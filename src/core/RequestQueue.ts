import { EventDispatcher } from 'three';
import PriorityQueue from 'ol/structs/PriorityQueue.js';
import OperationCounter from './OperationCounter';
import PromiseUtils from '../utils/PromiseUtils.js';

function defaultShouldExecute() {
    return true;
}

class Task {
    readonly id: string;
    private readonly priority: number;
    private readonly signal: AbortSignal;
    private readonly resolve: Function;
    private readonly request: () => Promise<unknown>;

    readonly reject: (reason?: Error | string) => void;
    readonly shouldExecute: () => boolean;

    constructor(
        id: string,
        signal: AbortSignal,
        priority: number,
        request: () => Promise<unknown>,
        resolve: Function,
        reject: (reason?: any) => void,
        shouldExecute: () => boolean,
    ) {
        this.id = id;
        this.priority = priority;
        this.signal = signal;
        this.resolve = resolve;
        this.reject = reject;
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

function priorityFn(task: Task) {
    return task.getPriority();
}

function keyFn(task: Task) {
    return task.getKey();
}

const MAX_CONCURRENT_REQUESTS = 10;

/**
 * A generic priority queue that ensures that the same request cannot be added twice in the queue.
 */
class RequestQueue extends EventDispatcher {
    private readonly pendingIds: Map<string, Promise<unknown>>;
    private readonly queue: PriorityQueue<Task>;
    private readonly opCounter: OperationCounter;
    private readonly maxConcurrentRequests: number;

    private concurrentRequests: number;

    /**
     * @param options Options.
     * @param options.maxConcurrentRequests The maximum number of concurrent requests.
     */
    constructor(options: { maxConcurrentRequests?: number; } = {}) {
        super();
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

            const task = this.queue.dequeue();
            const key = task.getKey();

            if (task.shouldExecute()) {
                this.concurrentRequests++;
                task.execute().finally(() => {
                    this.opCounter.decrement();
                    this.pendingIds.delete(key);
                    this.concurrentRequests--;
                    this.onQueueAvailable();
                    this.dispatchEvent({ type: 'task-executed' });
                });
            } else {
                this.opCounter.decrement();
                this.pendingIds.delete(key);
                this.onQueueAvailable();
                task.reject(PromiseUtils.abortError());
                this.dispatchEvent({ type: 'task-cancelled' });
            }
        }
    }

    /**
     * Enqueues a request. If a request with the same id is currently in the queue, then returns
     * the promise associated with the existing request.
     *
     * @param options Options.
     * @param options.id The unique identifier of this request.
     * @param options.request The request.
     * @param options.shouldExecute The optional filter function used
     * to discard a task: if the function returns `false`, the task is not executed.
     * @param options.signal The abort signal.
     * @param options.priority The priority of this request.
     * @returns A promise that resolves when the requested is completed.
     */
    enqueue(options: {
        id: string,
        request: () => Promise<unknown>,
        signal?: AbortSignal,
        priority?: number,
        shouldExecute?: () => boolean,
    }) {
        const {
            id, request, signal, shouldExecute,
        } = options;

        const priority = options.priority ?? 0;

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
 */
const DefaultQueue: RequestQueue = new RequestQueue();

export { DefaultQueue };

export default RequestQueue;
