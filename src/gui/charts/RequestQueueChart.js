/**
 * @module gui/charts/MemoryUsage
 */
import GUI from 'lil-gui';
import { Chart } from 'chart.js';
import Instance from '../../core/Instance.js';
import ChartPanel, { pushTrim } from './ChartPanel.js';
import { DefaultQueue } from '../../core/RequestQueue';

const MAX_DATA_POINTS = 20;

class RequestQueueChart extends ChartPanel {
    /**
     * Creates an instance of RequestQueueChart.
     *
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The giro3D instance.
     * @memberof RequestQueueChart
     */
    constructor(parentGui, instance) {
        super(parentGui, instance, 'Request queue');

        this.labels = [];
        this.queue = DefaultQueue;

        this.currentRequests = {
            label: 'Executing',
            data: [],
            fill: false,
            borderWidth: 2,
            pointRadius: 0,
            backgroundColor: '#FF000030',
            borderColor: '#FF000080',
            yAxisID: 'y',
        };

        this.pendingRequests = {
            label: 'Pending',
            data: [],
            fill: false,
            borderWidth: 2,
            pointRadius: 0,
            backgroundColor: '#0050FF30',
            borderColor: '#0050FFFF',
            yAxisID: 'y1',
        };

        this.data = {
            labels: this.labels,
            datasets: [this.currentRequests, this.pendingRequests],
        };

        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: this.data,
            options: {
                animation: false,
                parsing: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                    },
                    title: {
                        display: true,
                        text: 'Requests queue',
                    },
                },
                scales: {
                    x: {
                        display: false,
                        bounds: 'data',
                        type: 'linear',
                    },
                    y: {
                        bounds: 'data',
                        type: 'linear',
                        suggestedMin: 0,
                        position: 'left',
                        ticks: {
                            color: '#FF5000',
                        },
                    },
                    y1: {
                        position: 'right',
                        ticks: {
                            color: '#0050FF',
                        },
                    },
                },
            },
        });
    }

    updateValues() {
        if (this.gui._closed) {
            return;
        }

        const t = performance.now();
        const q = this.queue;
        console.log(q.pendingRequests);

        pushTrim(this.currentRequests.data, { x: t, y: q.concurrentRequests }, MAX_DATA_POINTS);
        pushTrim(this.pendingRequests.data, { x: t, y: q.pendingRequests }, MAX_DATA_POINTS);
        pushTrim(this.labels, '', MAX_DATA_POINTS);

        this.chart.update();
    }
}

export default RequestQueueChart;
