import type GUI from 'lil-gui';
import type Instance from '../core/Instance.js';
import Panel from './Panel.js';
import type DrawingCollection from '../entities/DrawingCollection.js';
import type Drawing from '../interactions/Drawing.js';
import EntityInspector from './EntityInspector.js';

class DrawingInspector extends Panel {
    drawing: Drawing;
    drawingEntity: DrawingCollection;
    geometryType: string;

    /**
     * @param gui - The GUI.
     * @param instance - The Giro3D instance.
     * @param drawingEntity - The drawing entity.
     * @param drawing - The drawing to inspect
     */
    constructor(gui: GUI, instance: Instance, drawingEntity: DrawingCollection, drawing: Drawing) {
        super(gui, instance, `${drawing.type} ('${drawing.name ?? drawing.id}')`);

        this.drawing = drawing;
        this.drawingEntity = drawingEntity;
        this.geometryType = drawing.geometryType ?? 'undefined';

        this.addController(this.drawing, 'id').name('Identifier');
        this.addController(this.drawing, 'name').name('Name');
        this.addController(this, 'geometryType').name('Geometry type');
    }
}

class DrawingCollectionInspector extends EntityInspector {
    drawingEntity: DrawingCollection;
    drawingCount: number;

    drawingFolder: GUI;
    drawings: DrawingInspector[];
    private _fillDrawingsCb: () => void;

    /**
     * Creates an instance of DrawingEntity.
     *
     * @param parentGui - The parent GUI.
     * @param instance - The Giro3D instance.
     * @param drawingEntity - The inspected Features.
     */
    constructor(parentGui: GUI, instance: Instance, drawingEntity: DrawingCollection) {
        super(parentGui, instance, drawingEntity, {
            title: `Drawings ('${drawingEntity.id}')`,
            visibility: true,
            boundingBoxColor: true,
            boundingBoxes: true,
            opacity: true,
        });

        this.drawingEntity = drawingEntity;
        this.drawingCount = 0;
        this.addController(this, 'drawingCount').name('Number of drawings');

        this.drawingFolder = this.gui.addFolder('Drawings');
        this.drawings = [];

        this._fillDrawingsCb = () => this.fillDrawings();
        this.drawingEntity.addEventListener('drawing-added', this._fillDrawingsCb);
        this.drawingEntity.addEventListener('drawing-removed', this._fillDrawingsCb);

        this.fillDrawings();
    }

    updateValues() {
        super.updateValues();
        this.drawingCount = this.drawingEntity.children.length;
        this.drawings.forEach(l => l.updateValues());
    }

    fillDrawings() {
        while (this.drawings.length > 0) {
            this.drawings.pop().dispose();
        }
        this.drawingEntity.children.forEach(lyr => {
            const gui = new DrawingInspector(
                this.drawingFolder, this.instance, this.drawingEntity, lyr,
            );
            this.drawings.push(gui);
        });
    }
}

export default DrawingCollectionInspector;
