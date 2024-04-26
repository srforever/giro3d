import type GUI from 'lil-gui';
import Panel from './Panel';
import type Instance from '../core/Instance';
import FrameDuration from './charts/FrameDuration';
import MemoryUsage from './charts/MemoryUsage';
import MemoryTracker from '../renderer/MemoryTracker';
import CachePanel from './CachePanel';
import FetcherPanel from './FetcherPanel';
import RequestQueueChart from './charts/RequestQueueChart';
import PickingDuration from './charts/PickingDuration';

class ProcessingInspector extends Panel {
    charts: Panel[];

    /**
     * @param gui - The GUI.
     * @param instance - The Giro3D instance.
     */
    constructor(gui: GUI, instance: Instance) {
        super(gui, instance, 'Processing');

        this.charts = [];

        this.charts.push(new FrameDuration(this.gui, instance));
        this.charts.push(new PickingDuration(this.gui, instance));
        this.charts.push(new RequestQueueChart(this.gui, instance));
        this.charts.push(new MemoryUsage(this.gui, instance));
        this.charts.push(new CachePanel(this.gui, instance));
        this.charts.push(new FetcherPanel(this.gui, instance));

        this.addController(MemoryTracker, 'enable').name('Memory tracker');
        this.addController(this, 'dumpTrackedObjects').name('Dump tracked objects to console');
        this.addController(this, 'dumpTrackedTextures').name('Dump tracked textures to console');
    }

    // eslint-disable-next-line class-methods-use-this
    dumpTrackedObjects() {
        console.log(MemoryTracker.getTrackedObjects());
    }

    dumpTrackedTextures() {
        const items = MemoryTracker.getTrackedTextures();
        console.log(
            items
                .filter(item => item.inGpuMemory)
                .map(item => `${item.texture.id} - ${item.texture.name}`),
        );
    }

    updateValues() {
        this.charts.forEach(c => c.update());
    }
}

export default ProcessingInspector;
