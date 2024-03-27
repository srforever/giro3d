import type { Object3D, Vector2 } from 'three';
import { Group, MathUtils } from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import type { Entity3DEventMap } from './Entity3D';
import Entity3D from './Entity3D';
import type Drawing from '../interactions/Drawing';
import type PickOptions from '../core/picking/PickOptions';
import type PickResult from '../core/picking/PickResult';
import pickObjectsAt from '../core/picking/PickObjectsAt';
import type Pickable from '../core/picking/Pickable';

export interface DrawingPickResult extends PickResult {
    isDrawingPickResult: true;
    // eslint-disable-next-line no-use-before-define
    entity: DrawingCollection;
    drawing: Drawing;
}

/**
 * Tests whether an object implements {@link DrawingPickResult}.
 *
 * @param obj - Object
 * @returns `true` if the object implements the interface.
 */
export const isDrawingPickResult = (obj: unknown): obj is DrawingPickResult =>
    (obj as DrawingPickResult).isDrawingPickResult;

export interface DrawingCollectionEventMap extends Entity3DEventMap {
    /**
     * Fired when a drawing gets added to this entity.
     */
    'drawing-added': { drawing: Drawing };
    /**
     * Fired when a drawing gets removed from this entity.
     */
    'drawing-removed': { drawing: Drawing };
}

/**
 * Entity for holding {@link Drawing} compatible with the {@link DrawTool}.
 *
 * It simplifies managing such drawings, especially with picking.
 */
class DrawingCollection
    extends Entity3D<DrawingCollectionEventMap>
    implements Pickable<DrawingPickResult>
{
    /** Read-only flag to check if a given object is of type DrawingCollection. */
    public readonly isDrawingCollection: boolean = true;
    public name: string;

    /**
     * Gets all children of this collection
     */
    get children(): Drawing[] {
        return this.object3d.children as Drawing[];
    }

    /**
     * Construct a `DrawingCollection`.
     *
     * @param id - The unique identifier of this DrawingCollection
     * @param drawings - An optional list of objects to add to the collection
     */
    constructor(id?: string, drawings: Drawing[] = []) {
        super(id ?? MathUtils.generateUUID(), new Group());
        this.type = 'DrawingCollection';
        drawings.forEach(d => this.add(d));
    }

    /**
     * Disposes of the object and all its children
     */
    dispose(): void {
        for (const o of this.children) {
            this.object3d.remove(o);
            o.dispose();
        }
    }

    /**
     * Adds a drawing to this collection.
     *
     * A drawing can only be in one collection at a time.
     *
     * @param drawing - Object to add
     */
    add(drawing: Drawing) {
        this.object3d.add(drawing);
        drawing.entity = this;
        this.onObjectCreated(drawing);
        this.dispatchEvent({ type: 'drawing-added', drawing });
    }

    /**
     * Removes a drawing from this collection.
     *
     * @param drawing - Object to remove
     */
    remove(drawing: Drawing) {
        this.object3d.remove(drawing);
        drawing.entity = null;
        drawing.traverse(o => {
            o.userData.parentEntity = null;
        });
        this.dispatchEvent({ type: 'drawing-removed', drawing });
    }

    onObjectCreated(obj: Object3D): void {
        obj.traverse(o => {
            o.userData.parentEntity = this;
        });
    }

    /**
     * Pick drawings from this collection.
     *
     * To correctly handle points rendered via `CSS2DObject`, their DOM element must:
     * - have `pointerEvents` to `none`,
     * - fill more or less their bounding box
     *
     * @param canvasCoords - Coordinates on the rendering canvas
     * @param options - Options
     * @returns Picked drawings (if any)
     */
    pick(canvasCoords: Vector2, options?: PickOptions): DrawingPickResult[] {
        const res: DrawingPickResult[] = [];
        let canvasRect: DOMRect;
        let canvasX: number;
        let canvasY: number;

        for (const drawing of this.children) {
            if (
                (drawing.geometryType === 'Point' || drawing.geometryType === 'MultiPoint') &&
                !drawing.use3Dpoints
            ) {
                for (const o of drawing.children as CSS2DObject[]) {
                    if (!canvasRect) {
                        // Canvas might not be at (0,0), we must compensate for it
                        // Compute it once if needed and reuse-it for other iterations
                        canvasRect = this._instance.domElement.getBoundingClientRect();
                        canvasX = canvasRect.left + canvasCoords.x;
                        canvasY = canvasRect.top + canvasCoords.y;
                    }

                    const domRect = o.element.getBoundingClientRect();
                    if (
                        canvasX >= domRect.left &&
                        canvasX <= domRect.right &&
                        canvasY >= domRect.top &&
                        canvasY <= domRect.bottom
                    ) {
                        const r: DrawingPickResult = {
                            isDrawingPickResult: true,
                            entity: this,
                            distance: this._instance.camera.camera3D.position.distanceTo(
                                o.position,
                            ),
                            point: o.position,
                            object: o,
                            drawing,
                        };
                        if (options?.filter && !options.filter(r)) continue;
                        res.push(r);
                        if (options?.limit != null && res.length >= options.limit) break;
                    }
                }
            } else {
                const newOptions = {
                    ...options,
                    limit: options?.limit != null ? options.limit - res.length : null,
                };

                const p = pickObjectsAt(this._instance, canvasCoords, drawing, newOptions).map(
                    picked =>
                        ({
                            ...picked,
                            drawing,
                            entity: this,
                            isDrawingPickResult: true,
                        }) as DrawingPickResult,
                );
                res.push(...p);
            }
        }
        return res;
    }
}

export default DrawingCollection;
