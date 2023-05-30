/**
 * @module gui/charts/FrameDuration
 */
import { Chart } from 'chart.js';
import ChartPanel, { pushTrim } from './ChartPanel.js';
import { MAIN_LOOP_EVENTS } from '@giro3d/giro3d/core/MainLoop.js';

const MAX_DATA_POINTS = 30;

class FrameDuration extends ChartPanel {
    constructor(parentGui, instance) {
        super(parentGui, instance, 'Frame duration (ms)');

        this.render = instance.mainLoop.gfxEngine.renderer.info.render;

        const totalFrameLength = {
            label: 'Total',
            tension: 0.2,
            data: [],
            fill: false,
            borderWidth: 2,
            pointRadius: 0,
            backgroundColor: '#FF000030',
            borderColor: '#FF000080',
        };

        const renderTime = {
            label: 'Render',
            tension: 0.2,
            data: [],
            fill: false,
            borderWidth: 2,
            pointRadius: 0,
            backgroundColor: '#0050FF30',
            borderColor: '#0050FFFF',
        };

        const labels = [];

        this.data = {
            labels,
            datasets: [totalFrameLength, renderTime],
        };

        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: this.data,
            options: {
                animation: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                    },
                    title: {
                        display: true,
                        text: 'Frame duration (ms)',
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
                    },
                },
            },
        });

        this.updateStart = -1;
        this.renderStart = -1;

        instance.addFrameRequester(
            MAIN_LOOP_EVENTS.UPDATE_START,
            () => {
                this.updateStart = performance.now();
            },
        );

        instance.addFrameRequester(
            MAIN_LOOP_EVENTS.UPDATE_END,
            () => {
                const now = performance.now();
                pushTrim(
                    totalFrameLength.data,
                    { x: this.render.frame, y: now - this.updateStart },
                    MAX_DATA_POINTS,
                );

                pushTrim(labels, '', MAX_DATA_POINTS);
            },
        );

        instance.addFrameRequester(
            MAIN_LOOP_EVENTS.BEFORE_RENDER,
            () => {
                this.renderStart = performance.now();
            },
        );

        instance.addFrameRequester(
            MAIN_LOOP_EVENTS.AFTER_RENDER,
            () => {
                const now = performance.now();
                pushTrim(
                    renderTime.data,
                    { x: this.render.frame, y: now - this.renderStart },
                    MAX_DATA_POINTS,
                );
            },
        );
    }

    updateValues() {
        if (this.gui._closed) {
            return;
        }

        this.chart.update();
    }
}

export default FrameDuration;
