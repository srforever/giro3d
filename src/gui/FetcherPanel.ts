import type GUI from 'lil-gui';
import Fetcher from '../utils/Fetcher';
import Panel from './Panel';
import type Instance from '../core/Instance';

class FetcherPanel extends Panel {
    pendingRequests: number;
    runningRequests: number;

    constructor(parentGui: GUI, instance: Instance) {
        super(parentGui, instance, 'Fetcher');
        this.updateValues();
        this.addController<number>(this, 'pendingRequests').name('Pending requests');
        this.addController<number>(this, 'runningRequests').name('Running requests');
    }

    updateValues() {
        const { pending, running } = Fetcher.getInfo();
        this.pendingRequests = pending;
        this.runningRequests = running;
    }
}

export default FetcherPanel;
