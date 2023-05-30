/**
 * @module gui/ProcessingInspector
 */
import GUI from 'lil-gui';

import Instance from '@giro3d/giro3d/core/Instance.js';
import MemoryTracker from '@giro3d/giro3d/renderer/MemoryTracker.js';

import FrameDuration from './charts/FrameDuration.js';
import MemoryUsage from './charts/MemoryUsage.js';
import CachePanel from './CachePanel.js';
import Panel from './Panel.js';

class ProcessingInspector extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(gui, instance) {
        super(gui, instance, 'Processing');

        this.scheduler = this.instance.mainLoop.scheduler;
        this.mainLoop = this.instance.mainLoop;

        this.pending = 0;
        this.running = 0;
        this.cancelled = 0;
        this.completed = 0;
        this.failed = 0;
        this.charts = [];

        this.addController(this, 'pending').name('Pending commands');
        this.addController(this, 'running').name('Running commands');
        this.addController(this, 'cancelled').name('Cancelled commands');
        this.addController(this, 'completed').name('Completed commands');
        this.addController(this, 'failed').name('Failed commands');

        this.addController(this, 'resetCounters').name('Reset command counters');

        this.charts.push(new FrameDuration(this.gui, instance));
        this.charts.push(new MemoryUsage(this.gui, instance));
        this.charts.push(new CachePanel(this.gui, instance));

        this.addController(MemoryTracker, 'enable').name('Memory tracker');
        this.addController(this, 'dumpTrackedObjects').name('Dump tracked objects to console');
    }

    resetCounters() {
        this.scheduler.resetCommandsCount('executing');
        this.scheduler.resetCommandsCount('executed');
        this.scheduler.resetCommandsCount('failed');
        this.scheduler.resetCommandsCount('cancelled');
        this.scheduler.resetCommandsCount('pending');

        this.updateControllers();
    }

    // eslint-disable-next-line class-methods-use-this
    dumpTrackedObjects() {
        console.log(MemoryTracker.getTrackedObjects());
    }

    updateValues() {
        this.charts.forEach(c => c.update());
        this.pending = this.scheduler.commandsWaitingExecutionCount();
        this.running = this.scheduler.commandsRunningCount();
        this.cancelled = this.scheduler.commandsCancelledCount();
        this.failed = this.scheduler.commandsFailedCount();
        this.completed = this.scheduler.commandsExecutedCount();
    }
}

export default ProcessingInspector;
