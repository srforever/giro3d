/**
 * @module gui/ProcessingInspector
 */
import GUI from 'lil-gui';
import Panel from './Panel.js';
import Instance from '../core/Instance';
import FrameDuration from './charts/FrameDuration.js';
import MemoryUsage from './charts/MemoryUsage.js';
import MemoryTracker from '../renderer/MemoryTracker.js';
import CachePanel from './CachePanel.js';
import FetcherPanel from './FetcherPanel.js';
import RequestQueueChart from './charts/RequestQueueChart.js';

class ProcessingInspector extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(gui, instance) {
        super(gui, instance, 'Processing');

        this.charts = [];

        this.charts.push(new FrameDuration(this.gui, instance));
        this.charts.push(new RequestQueueChart(this.gui, instance));
        this.charts.push(new MemoryUsage(this.gui, instance));
        this.charts.push(new CachePanel(this.gui, instance));
        this.charts.push(new FetcherPanel(this.gui, instance));

        this.addController(MemoryTracker, 'enable').name('Memory tracker');
        this.addController(this, 'dumpTrackedObjects').name('Dump tracked objects to console');
    }

    // eslint-disable-next-line class-methods-use-this
    dumpTrackedObjects() {
        console.log(MemoryTracker.getTrackedObjects());
    }

    updateValues() {
        this.charts.forEach(c => c.update());
    }
}

export default ProcessingInspector;
