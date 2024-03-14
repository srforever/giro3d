// eslint-disable-next-line import/no-named-as-default
import type GUI from 'lil-gui';
import type { Color } from 'three';
import type Instance from '../core/Instance';
import EntityInspector from './EntityInspector';
import type AxisGrid from '../entities/AxisGrid';
import { TickOrigin } from '../entities/AxisGrid';

class AxisGridInspector extends EntityInspector {
    /** The inspected grid. */
    grid: AxisGrid;
    absoluteTicks: boolean;

    /**
     * Creates an instance of AxisGridInspector.
     *
     * @param parentGui - The parent GUI.
     * @param instance - The Giro3D instance.
     * @param grid - The inspected Map.
     */
    constructor(parentGui: GUI, instance: Instance, grid: AxisGrid) {
        super(parentGui, instance, grid, {
            title: `AxisGrid ('${grid.id}')`,
            visibility: true,
            opacity: true,
        });

        this.grid = grid;

        this.absoluteTicks = this.grid.origin === TickOrigin.Absolute;

        this.addColorController(this.grid, 'color')
            .name('Grid color')
            .onChange(v => this.updateGridColor(v));
        this.addController<number>(this.grid.style, 'fontSize', 1, 20, 1)
            .name('Font size')
            .onChange(() => this._rebuild());
        this.addController<boolean>(this.grid, 'showHelpers')
            .name('Show debug helpers')
            .onChange(() => this.notify(this.grid));
        this.addController<boolean>(this.grid, 'showLabels')
            .name('Show labels')
            .onChange(() => this.notify(this.grid));
        this.addController<boolean>(this, 'absoluteTicks')
            .name('Absolute ticks')
            .onChange(v => this.updateTickOrigin(v));
        this.addController<boolean>(this.grid, 'showFloorGrid')
            .name('Show floor grid')
            .onChange(() => this.notify(this.grid));
        this.addController<boolean>(this.grid, 'showCeilingGrid')
            .name('Show ceiling grid')
            .onChange(() => this.notify(this.grid));
        this.addController<boolean>(this.grid, 'showSideGrids')
            .name('Show side grids')
            .onChange(() => this.notify(this.grid));

        this.addController<number>(this.grid.volume, 'floor')
            .name('Floor elevation')
            .onChange(() => this._rebuild());
        this.addController<number>(this.grid.volume, 'ceiling')
            .name('Ceiling elevation')
            .onChange(() => this._rebuild());
        this.addController<number>(this.grid.ticks, 'x')
            .name('X ticks')
            .onChange(() => this._rebuild());
        this.addController<number>(this.grid.ticks, 'y')
            .name('Y ticks')
            .onChange(() => this._rebuild());
        this.addController<number>(this.grid.ticks, 'z')
            .name('Z ticks')
            .onChange(() => this._rebuild());
    }

    _rebuild() {
        this.grid.refresh();
        this.notify(this.grid);
    }

    updateTickOrigin(v: boolean) {
        this.grid.origin = v ? TickOrigin.Absolute : TickOrigin.Relative;
        this.grid.refresh();
        this.notify(this.grid);
    }

    updateGridColor(v: Color) {
        this.grid.color = v;
        this.notify(this.grid);
    }
}

export default AxisGridInspector;
