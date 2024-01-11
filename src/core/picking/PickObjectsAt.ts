import {
    Color, type Object3D, Raycaster, Vector2,
} from 'three';
import type Instance from '../Instance';
import type Entity3D from '../../entities/Entity3D';
import type PickResult from './PickResult';
import type PickOptions from './PickOptions';
import traversePickingCircle from './PickingCircle';

const BLACK = new Color(0, 0, 0);
const raycaster = new Raycaster();

function findEntityInParent(obj: Object3D): Entity3D | null {
    if (obj.userData.parentEntity) {
        return obj.userData.parentEntity as Entity3D;
    }
    if (obj.parent) {
        return findEntityInParent(obj.parent);
    }
    return null;
}

/**
 * Default picking object. Uses RayCaster
 *
 * @param instance Instance to pick from
 * @param canvasCoords Coordinates on the rendering canvas
 * @param object Object to pick from
 * @param options Options
 * @returns Array of picked objects
 */
function pickObjectsAt(
    instance: Instance,
    canvasCoords: Vector2,
    object: Object3D,
    options: PickOptions = {},
) {
    const radius = options.radius ?? 0;
    const limit = options.limit ?? Infinity;
    const filter = options.filter;
    const target: PickResult[] = [];

    // Instead of doing N raycast (1 per x,y returned by traversePickingCircle),
    // we force render the zone of interest.
    // Then we'll only do raycasting for the pixels where something was drawn.
    const zone = {
        x: canvasCoords.x - radius,
        y: canvasCoords.y - radius,
        width: 1 + radius * 2,
        height: 1 + radius * 2,
    };

    const clearColor = BLACK;

    const pixels = instance.engine.renderToBuffer({
        scene: object,
        camera: instance.camera.camera3D,
        zone,
        clearColor,
    });

    const clearR = Math.round(255 * clearColor.r);
    const clearG = Math.round(255 * clearColor.g);
    const clearB = Math.round(255 * clearColor.b);

    // Raycaster use NDC coordinate
    const vec2 = new Vector2();
    const normalized = instance.canvasToNormalizedCoords(canvasCoords, vec2);
    const tmp = normalized.clone();
    traversePickingCircle(radius, (x, y) => {
        // x, y are offset from the center of the picking circle,
        // and pixels is a square where 0, 0 is the top-left corner.
        // So we need to shift x,y by radius.
        const xi = x + radius;
        const yi = y + radius;
        const offset = (yi * (radius * 2 + 1) + xi) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        // Use approx. test to avoid rounding error or to behave
        // differently depending on hardware rounding mode.
        if (Math.abs(clearR - r) <= 1
            && Math.abs(clearG - g) <= 1
            && Math.abs(clearB - b) <= 1) {
            // skip because nothing has been rendered here
            return null;
        }

        // Perform raycasting
        tmp.setX(normalized.x + x / instance.camera.width)
            .setY(normalized.y + y / instance.camera.height);
        raycaster.setFromCamera(
            tmp,
            instance.camera.camera3D,
        );

        const intersects = raycaster.intersectObject(object, true) as PickResult[];
        for (const inter of intersects) {
            inter.entity = findEntityInParent(inter.object);
            if (!filter || filter(inter)) {
                target.push(inter);
                if (target.length >= limit) return false;
            }
        }

        // Stop at first hit
        return target.length === 0;
    });

    return target;
}

export default pickObjectsAt;
