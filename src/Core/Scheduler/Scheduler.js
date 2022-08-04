import PriorityQueue from 'js-priority-queue';
import TileState from 'ol/TileState.js';
import TileProvider from '../../Provider/TileProvider.js';
import $3dTilesProvider from '../../Provider/3dTilesProvider.js';
import TMSProvider from '../../Provider/TMSProvider.js';
import PointCloudProvider from '../../Provider/PointCloudProvider.js';
import StaticProvider from '../../Provider/StaticProvider.js';
import OLTileProvider from '../../Provider/OLTileProvider.js';
import OLVectorTileProvider from '../../Provider/OLVectorTileProvider.js';
import OLVectorProvider from '../../Provider/OLVectorProvider.js';
import COGProvider from '../../Provider/COGProvider.js';
import CancelledCommandException from './CancelledCommandException.js';
import Cache from './Cache.js';

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
        execute(cmd, provider, countersIncrement = 1) {
            this.counters.pending -= countersIncrement;
            this.counters.executing += countersIncrement;
            return provider.executeCommand(cmd).then(result => {
                this.counters.executing -= countersIncrement;
                cmd.resolve(result);
                // only count successul commands
                this.counters.executed += countersIncrement;
            }, err => {
                this.counters.executing -= countersIncrement;
                cmd.reject(err);
                this.counters.failed += countersIncrement;
                if (this.counters.failed < 3) {
                    console.error(err);
                }
            });
        },
    };
}

/**
 * The Scheduler is in charge of managing the [Providers]{@link Provider} that
 * are used to gather resources needed to display the layers on a {@link Instance}.
 * There is only one instance of a Scheduler per webview, and it is instanciated
 * with the creation of the first view.
 */
function Scheduler() {
    // Constructor
    if (instanceScheduler !== null) {
        throw new Error('Cannot instantiate more than one Scheduler');
    }

    this.defaultQueue = _instanciateQueue();
    this.hostQueues = new Map();

    this.providers = {};

    this.maxCommandsPerHost = 6;

    // TODO: add an options to not instanciate default providers
    this.initDefaultProviders();
}

Scheduler.prototype.constructor = Scheduler;

Scheduler.prototype.initDefaultProviders = function initDefaultProviders() {
    // Register all providers
    this.addProtocolProvider('tile', TileProvider);
    this.addProtocolProvider('3d-tiles', $3dTilesProvider);
    this.addProtocolProvider('tms', TMSProvider);
    this.addProtocolProvider('xyz', TMSProvider);
    this.addProtocolProvider('potreeconverter', PointCloudProvider);
    this.addProtocolProvider('static', StaticProvider);
    this.addProtocolProvider('oltile', OLTileProvider);
    this.addProtocolProvider('olvectortile', OLVectorTileProvider);
    this.addProtocolProvider('olvector', OLVectorProvider);
    this.addProtocolProvider('cog', COGProvider);
};

Scheduler.prototype.runCommand = function runCommand(command, queue, recurse = true) {
    const provider = this.providers[command.layer.protocol];

    if (!provider) {
        throw new Error('No known provider for layer', command.layer.id);
    }

    return queue.execute(command, provider, recurse ? 1 : 0).then(() => {
        // notify view that one command ended.
        command.view.notifyChange(command.requester, command.redraw);

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
    // Probably belongs to the provider (= it's part of a command API)
    if (command.url) {
        return !!Cache.get(command.url);
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
        //   - Promise is a micro-task, executed before other tasks
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

/**
 * A Provider has the responsability to handle protocols and datablobs. Given a
 * data request (see {@link Provider#executeCommand} for details about this
 * request), it fetches serialized datasets, file content or even file chunks.
 *
 * @interface Provider
 */

/**
 * When adding a layer to a view, some preprocessing can be done on it, before
 * fetching or creating resources attached to it. For example, in the WMTS and
 * WFS providers (included in giro3d), default options to the layer are added if
 * some are missing.
 *
 * @function
 * @name Provider#preprocessDataLayer
 * @param {module:Core/Layer~Layer} layer
 * @param {module:Core/Instance~Instance} [instance]
 * @param {Scheduler} [scheduler]
 * @param {module:Core/Layer~Layer} [parentLayer]
 */

/**
 * In the {@link Scheduler} loop, this function is called every time the layer
 * needs new information about itself. For tiled layers, it gets the necessary
 * tiles, given the current position of the camera on the map. For simple layers
 * like a GPX trace, it gets the data once.
 * <br><br>
 * It passes a <code>command</code> object as a parameter, with the
 * <code>view</code> and the <code>layer</code> always present. The other
 * parameters are optional.
 *
 * @function
 * @name Provider#executeCommand
 * @param {object} command
 * @param {module:Core/Instance~Instance} command.instance the giro3d instance
 * @param {module:Core/Layer~Layer} command.layer
 * @param {module:Core/TileMesh~TileMesh} [command.requester] Every layer is attached to a tile.
 * @param {number} [command.targetLevel] The target level is used when there
 * is a tiled layer, such as WMTS or TMS, but not in case like a GPX layer.
 * @returns {Promise} The {@link Scheduler} always expect a Promise as a result,
 * resolving to an object containing sufficient information for the associated
 * processing to the current layer. For example, see the
 * LayeredMaterialNodeProcessing#updateLayeredMaterialNodeElevation
 * function or other processing class.
 */

/**
 * Adds a provider for a specified protocol. The provider will be used when
 * executing the queue to provide resources. See {@link Provider} for more
 * informations.
 * By default, some protocols are already set in giro3d: WMTS, WMS, WFS, TMS,
 * XYZ, PotreeConverter, Rasterizer, 3D-Tiles and Static.
 * <br><br>
 * Warning: if the specified protocol has already a provider attached to it, the
 * current provider will be overwritten by the given provider.
 *
 * @param {string} protocol The name of the protocol to add. This is the
 * <code>protocol</code> parameter put inside the configuration when adding a
 * layer. The capitalization of the name is not taken into account here.
 * @param {Provider} provider The provider to link to the protocol, that must
 * respect the {@link Provider} interface description.
 * @throws {Error} an error if any method of the {@link Provider} is not present
 * in the provider.
 */
Scheduler.prototype.addProtocolProvider = function addProtocolProvider(protocol, provider) {
    if (typeof (provider.executeCommand) !== 'function') {
        throw new Error(`Can't add provider for ${protocol}: missing a executeCommand function.`);
    }
    if (typeof (provider.preprocessDataLayer) !== 'function') {
        throw new Error(`Can't add provider for ${protocol}: missing a preprocessDataLayer function.`);
    }

    this.providers[protocol] = provider;
};

/**
 * Get a specific {@link Provider} given a particular protocol.
 *
 * @param {string} protocol the protocol name
 * @returns {Provider} the provider associated with the specified name
 */
Scheduler.prototype.getProtocolProvider = function getProtocolProvider(protocol) {
    return this.providers[protocol];
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

        if (cmd.earlyDropFunction && cmd.earlyDropFunction(cmd)) {
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
