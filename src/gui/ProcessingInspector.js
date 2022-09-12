/**
 * @module gui/ProcessingInspector
 */
import GUI from 'lil-gui';
import Panel from './Panel.js';
import Instance from '../Core/Instance.js';
import FrameDuration from './charts/FrameDuration.js';
import MemoryUsage from './charts/MemoryUsage.js';

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
        this.charts = [];

        this.addController(this, 'pending').name('Pending commands');
        this.addController(this, 'running').name('Running commands');

        this.charts.push(new FrameDuration(this.gui, instance));
        this.charts.push(new MemoryUsage(this.gui, instance));
    }

    updateValues() {
        this.charts.forEach(c => c.update());
        this.pending = this.scheduler.commandsWaitingExecutionCount();
        this.running = this.scheduler.commandsRunningCount();
    }
}

export default ProcessingInspector;
