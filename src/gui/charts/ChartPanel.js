/**
 * @module gui/charts/ChartPanel
 */
import {
    BarController,
    BarElement,
    Chart,
    Filler,
    Legend,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    Title,
} from 'chart.js';
import Panel from '../Panel.js';

/**
 * Pushes the value in the array, removing old values in array length exceeds MAX_DATA_POINTS.
 *
 * @param {Array} array The array
 * @param {any} value The value
 * @param {number} limit The limit of the array size, before trimming.
 */
export function pushTrim(array, value, limit) {
    if (array.length > limit) {
        array.shift();
    }
    array.push(value);
}

/**
 * Base class for all chart panels.
 *
 * @abstract
 */
class ChartPanel extends Panel {
    constructor(parentGui, instance, name) {
        super(parentGui, instance, name);

        Chart.register(
            LinearScale,
            LineController,
            PointElement,
            LineElement,
            BarElement,
            BarController,
            Title,
            Legend,
            Filler,
        );

        this.ctx = document.createElement('canvas');

        const children = this.gui.domElement.getElementsByClassName('children');
        children[0].appendChild(this.ctx);
    }
}

export default ChartPanel;
