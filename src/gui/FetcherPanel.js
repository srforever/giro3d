/**
 * @module gui/FetcherPanel
 */

import Fetcher from '../utils/Fetcher.js';
import Panel from './Panel.js';

class FetcherPanel extends Panel {
    constructor(parentGui, instance) {
        super(parentGui, instance, 'Fetcher');
        this.updateValues();
        this.addController(this, 'pendingRequests').name('Pending requests');
        this.addController(this, 'runningRequests').name('Running requests');
    }

    updateValues() {
        const { pending, running } = Fetcher.getInfo();
        this.pendingRequests = pending;
        this.runningRequests = running;
    }
}

export default FetcherPanel;
