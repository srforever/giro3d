/**
 * @module gui/charts/MemoryUsage
 */
import GUI from 'lil-gui';
import { Chart } from 'chart.js';
import Instance from '../../core/Instance.js';
import ChartPanel, { pushTrim } from './ChartPanel.js';

const MAX_DATA_POINTS = 20;

class MemoryUsage extends ChartPanel {
    /**
     * Creates an instance of MemoryUsage.
     *
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The giro3D instance.
     * @memberof MemoryUsage
     */
    constructor(parentGui, instance) {
        super(parentGui, instance, 'Memory');

        this.render = instance.mainLoop.gfxEngine.renderer.info.render;
        this.memory = instance.mainLoop.gfxEngine.renderer.info.memory;
        this.labels = [];

        this.textures = {
            label: 'Textures',
            data: [],
            fill: false,
            borderWidth: 2,
            pointRadius: 0,
            backgroundColor: '#FF000030',
            borderColor: '#FF000080',
            yAxisID: 'y',
        };

        this.geometries = {
            label: 'Geometries',
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
            datasets: [this.textures, this.geometries],
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
                        text: 'three.js object count',
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

        const frame = this.render.frame;
        pushTrim(this.textures.data, { x: frame, y: this.memory.textures }, MAX_DATA_POINTS);
        pushTrim(this.geometries.data, { x: frame, y: this.memory.geometries }, MAX_DATA_POINTS);
        pushTrim(this.labels, '', MAX_DATA_POINTS);

        this.chart.update();
    }
}

export default MemoryUsage;
