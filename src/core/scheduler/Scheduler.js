import PriorityQueue from 'js-priority-queue';
import TileState from 'ol/TileState.js';
import CancelledCommandException from './CancelledCommandException.js';

const instanceScheduler = null;

function queueOrdering(a, b) {
    const cmp = b.priority - a.priority;
    // Prioritize recent commands
    if (cmp === 0) {
        return b.timestamp - a.timestamp;
    }
    return cmp;
}

function drawNextLayer(storages) {
    // Dithering algorithm to select the next layer
    // see https://gamedev.stackexchange.com/a/95696 for more details
    let sum = 0;
    let selected;
    let max;
    for (const item of storages) {
        const st = item[1];
        if (st.q.length > 0) {
            sum += st.priority;
            st.accumulator += st.priority;
            // Select the biggest accumulator
            if (!selected || st.accumulator > max) {
                selected = st;
                max = st.accumulator;
            }
        }
    }

    if (selected) {
        selected.accumulator -= sum;
        return selected.q;
    }
    return null;
}

function _instanciateQueue() {
    return {
        queue(command) {
            const { layer } = command;
            let st = this.storages.get(layer.id);
            if (!st) {
                st = {
                    q: new PriorityQueue({ comparator: queueOrdering }),
                    priority: 1,
                    accumulator: 0,
                };
                this.storages.set(layer.id, st);
            }
            // update priority (layer.priority may have changed)
            st.priority = layer.priority || 1;
            st.q.queue(command);
            this.counters.pending++;
        },
        storages: new Map(),
        counters: {
            // commands in progress
            executing: 0,
            // commands successfully executed
            executed: 0,
            // commands failed
            failed: 0,
            // commands cancelled
            cancelled: 0,
            // commands pending
            pending: 0,
        },
        execute(fn, resolve, reject, countersIncrement = 1) {
            this.counters.pending -= countersIncrement;
            this.counters.executing += countersIncrement;
            return fn().then(result => {
                this.counters.executing -= countersIncrement;
                resolve(result);
                // only count successul commands
                this.counters.executed += countersIncrement;
            }, err => {
                this.counters.executing -= countersIncrement;
                reject(err);
                if (err instanceof CancelledCommandException) {
                    this.counters.cancelled += countersIncrement;
                } else {
                    this.counters.failed += countersIncrement;
                    if (this.counters.failed < 3) {
                        console.error(err);
                    }
                }
            });
        },
    };
}

function Scheduler() {
    // Constructor
    if (instanceScheduler !== null) {
        throw new Error('Cannot instantiate more than one Scheduler');
    }

    this.defaultQueue = _instanciateQueue();
    this.hostQueues = new Map();

    this.maxCommandsPerHost = 6;
}

Scheduler.prototype.constructor = Scheduler;

Scheduler.prototype.runCommand = function runCommand(command, queue, recurse = true) {
    if (!command.fn) {
        command.reject('No callback function provided in command: ', command);
        return command.promise;
    }
    return queue.execute(command.fn, command.resolve, command.reject, recurse ? 1 : 0).then(() => {
        // notify instance that one command ended.
        command.instance.notifyChange(command.requester, command.redraw);

        if (recurse) {
            this.flush(queue, command.layer.id);
        }

        // try to execute next command
        if (recurse && queue.counters.executing < this.maxCommandsPerHost) {
            const cmd = this.deQueue(queue);
            if (cmd) {
                this.runCommand(cmd, queue);
            }
        }
    });
};

Scheduler.prototype.execute = function execute(command) {
    // parse host
    const { layer } = command;
    const host = layer.url ? new URL(layer.url, document.location).host : undefined;

    command.promise = new Promise((resolve, reject) => {
        command.resolve = resolve;
        command.reject = reject;
    });

    // init queue if needed
    if (host && !(this.hostQueues.has(host))) {
        this.hostQueues.set(host, _instanciateQueue());
    }

    const q = host ? this.hostQueues.get(host) : this.defaultQueue;

    if (isInCache(command)) {
        // Fast path: command result is already available,
        // so skip the queueing mechanism and execute directly
        this.runCommand(command, q, false);
    } else {
        q.queue(command);
    }

    this.executeNextForQueue(q);

    return command.promise;
};

function isInCache(command) {
    if (!command.toDownload) {
        return false;
    }

    if (command.tile) {
        return command.tile.getState() === TileState.LOADED;
    }
    return false;
}

Scheduler.prototype.flush = function flush(queue, layerId) {
    if (layerId) {
        const flushed = [];
        const store = queue.storages.get(layerId);
        for (let i = 0; i < store.q.priv.data.length; i++) {
            const cmd = store.q.priv.data[i];
            if (isInCache(cmd)) {
                // TODO: we'd like this command to be run in a sync fashion,
                // since we know the result is already available. This would
                // reduce latency, and avoid the need for the Promise.all()
                flushed.push(this.runCommand(cmd, queue, false));

                store.q.priv.data.splice(i, 1);
                store.q.length--;
                i--;
            }
        }
        if (flushed.length) {
            Promise.all(flushed).then(() => {
                this.executeNextForQueue(queue);
            });
        }
    }
};

Scheduler.prototype.executeNextForQueue = function executeNextForQueue(queue) {
    if (queue.counters.executing < this.maxCommandsPerHost) {
        // Defer the processing after the end of the current frame.
        // Promise.resolve or setTimeout(..., 0) will do the job, the difference
        // is:
        //   - setTimeout is a new task, queued in the event-loop queues
        //   - Promise is a micro-task, executed before other tasks in the current macro-task.
        Promise.resolve().then(() => {
            if (queue.counters.executing < this.maxCommandsPerHost) {
                const cmd = this.deQueue(queue);
                if (cmd) {
                    this.runCommand(cmd, queue);
                }
            }
        });
    }
};

Scheduler.prototype.commandsWaitingExecutionCount = function commandsWaitingExecutionCount() {
    let sum = this.defaultQueue.counters.pending + this.defaultQueue.counters.executing;
    for (const q of this.hostQueues) {
        sum += q[1].counters.pending + q[1].counters.executing;
    }
    return sum;
};

Scheduler.prototype.commandsRunningCount = function commandsRunningCount() {
    let sum = this.defaultQueue.counters.executing;

    for (const q of this.hostQueues) {
        sum += q[1].counters.executing;
    }
    return sum;
};

Scheduler.prototype.commandsCancelledCount = function commandsCancelledCount() {
    let sum = this.defaultQueue.counters.cancelled;

    for (const q of this.hostQueues) {
        sum += q[1].counters.cancelled;
    }
    return sum;
};

Scheduler.prototype.commandsExecutedCount = function commandsExecutedCount() {
    let sum = this.defaultQueue.counters.executed;

    for (const q of this.hostQueues) {
        sum += q[1].counters.executed;
    }
    return sum;
};

Scheduler.prototype.commandsFailedCount = function commandsFailedCount() {
    let sum = this.defaultQueue.counters.failed;

    for (const q of this.hostQueues) {
        sum += q[1].counters.failed;
    }
    return sum;
};

Scheduler.prototype.resetCommandsCount = function resetCommandsCount(type) {
    let sum = this.defaultQueue.counters[type];
    this.defaultQueue.counters[type] = 0;
    for (const q of this.hostQueues) {
        sum += q[1].counters[type];
        q[1].counters[type] = 0;
    }
    return sum;
};

Scheduler.prototype.deQueue = function deQueue(queue) {
    const st = drawNextLayer(queue.storages);
    while (st && st.length > 0) {
        const cmd = st.dequeue();

        if (cmd.earlyDropFunction && cmd.earlyDropFunction()) {
            queue.counters.pending--;
            queue.counters.cancelled++;
            cmd.reject(new CancelledCommandException(cmd));
        } else {
            return cmd;
        }
    }

    if (st) {
        // retry, in another layer
        return this.deQueue(queue);
    }
    return null;
};

export default Scheduler;
