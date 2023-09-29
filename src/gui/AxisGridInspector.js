/**
 * @module gui/AxisGridInspector
 */
import GUI from 'lil-gui';
import Instance from '../core/Instance.js';
import EntityInspector from './EntityInspector.js';
import AxisGrid, { TickOrigin } from '../entities/AxisGrid.js';

class AxisGridInspector extends EntityInspector {
    /**
     * Creates an instance of AxisGridInspector.
     *
     * @param {GUI} parentGui The parent GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {AxisGrid} grid The inspected Map.
     */
    constructor(parentGui, instance, grid) {
        super(parentGui, instance, grid, {
            title: `AxisGrid ('${grid.id}')`,
            visibility: true,
            opacity: true,
        });

        /**
         * The inspected grid.
         *
         * @type {AxisGrid}
         */
        this.grid = grid;

        this.absoluteTicks = this.grid.origin === TickOrigin.Absolute;

        this.addColorController(this.grid, 'color')
            .name('Grid color')
            .onChange(v => this.updateGridColor(v));
        this.addController(this.grid.style, 'fontSize', 1, 20, 1)
            .name('Font size')
            .onChange(() => this._rebuild());
        if (__DEBUG__) {
            this.addController(this.grid, 'showHelpers')
                .name('Show debug helpers')
                .onChange(() => this.notify(this.grid));
        }
        this.addController(this.grid, 'showLabels')
            .name('Show labels')
            .onChange(() => this.notify(this.grid));
        this.addController(this, 'absoluteTicks')
            .name('Absolute ticks')
            .onChange(v => this.updateTickOrigin(v));
        this.addController(this.grid, 'showFloorGrid')
            .name('Show floor grid')
            .onChange(() => this.notify(this.grid));
        this.addController(this.grid, 'showCeilingGrid')
            .name('Show ceiling grid')
            .onChange(() => this.notify(this.grid));
        this.addController(this.grid, 'showSideGrids')
            .name('Show side grids')
            .onChange(() => this.notify(this.grid));

        this.addController(this.grid.volume, 'floor')
            .name('Floor elevation')
            .onChange(() => this._rebuild());
        this.addController(this.grid.volume, 'ceiling')
            .name('Ceiling elevation')
            .onChange(() => this._rebuild());
        this.addController(this.grid.ticks, 'x')
            .name('X ticks')
            .onChange(() => this._rebuild());
        this.addController(this.grid.ticks, 'y')
            .name('Y ticks')
            .onChange(() => this._rebuild());
        this.addController(this.grid.ticks, 'z')
            .name('Z ticks')
            .onChange(() => this._rebuild());
    }

    _rebuild() {
        this.grid.refresh();
        this.notify(this.grid);
    }

    updateTickOrigin(v) {
        this.grid.origin = v ? TickOrigin.Absolute : TickOrigin.Relative;
        this.grid.refresh();
        this.notify(this.grid);
    }

    updateGridColor(v) {
        this.grid.color = v;
        this.notify(this.grid);
    }
}

export default AxisGridInspector;
