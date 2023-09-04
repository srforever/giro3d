import { EventDispatcher } from 'three';
import Progress from './Progress';

/**
 * Provides a way to track the progress of running operations.
 *
 * @fires complete When all pending operations are completed.
 */
class OperationCounter extends EventDispatcher implements Progress {
    private _operations: number;
    private _completed: number;
    private _total: number;

    constructor() {
        super();

        this._operations = 0;
        this._completed = 0;
        this._total = 0;
    }

    /**
     * Gets whether at least one operation is being executed.
     */
    get loading() {
        return this._operations > 0;
    }

    /**
     * Returns a number between 0 and 1 which represent the ratio between
     * completed operations and total operations.
     */
    get progress() {
        if (this._operations === 0) {
            return 1;
        }

        return this._completed / this._total;
    }

    /**
     * Decrements the number of pending operations.
     */
    decrement() {
        if (this._operations === 0) {
            return;
        }

        this._operations--;
        this._completed++;

        if (this._operations === 0) {
            this._total = 0;
            this._completed = 0;
            this.dispatchEvent({ type: 'complete' });
        }
    }

    /**
     * Increment the number of pending operations.
     */
    increment() {
        this._operations++;
        this._total++;
    }
}

export default OperationCounter;
