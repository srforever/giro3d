import {
    Color, FloatType, Vector2, Vector3,
} from 'three';
import type Instance from '../Instance';
import type Map from '../../entities/Map';
import type TileMesh from '../TileMesh';
import type PickResult from './PickResult';
import type PickOptions from './PickOptions';
import Coordinates from '../geographic/Coordinates';
import RenderingState from '../../renderer/RenderingState';
import traversePickingCircle from './PickingCircle';

/** Pick result on tiles (e.g. map) */
export interface MapPickResult<TFeature extends any = any> extends PickResult<TFeature & any> {
    entity: Map;
    /** Tile containing the picked result. */
    object: TileMesh;
    /** Coordinates of the point picked. */
    coord: Coordinates;
}

const BLACK = new Color(0, 0, 0);
const tmpCoords = new Coordinates('EPSG:3857', 0, 0, 0);

function renderTileBuffer(
    instance: Instance,
    map: Map,
    coords: Vector2 | undefined,
    radius: number,
) {
    const dim = instance.engine.getWindowSize();

    coords = coords || new Vector2(Math.floor(dim.x / 2), Math.floor(dim.y / 2));

    const restore = map.setRenderState(RenderingState.PICKING);

    const buffer = instance.engine.renderToBuffer({
        camera: instance.camera.camera3D,
        scene: map.object3d,
        clearColor: BLACK,
        datatype: FloatType,
        zone: {
            x: coords.x - radius,
            y: coords.y - radius,
            width: 1 + radius * 2,
            height: 1 + radius * 2,
        },
    });

    restore();

    const ids: number[] = [];
    const uvs: Vector2[] = [];
    const zs: number[] = [];

    traversePickingCircle(radius, (x, y, idx) => {
        const px = idx * 4;
        const id = buffer[px + 0];
        const z = buffer[px + 1];
        const u = buffer[px + 2];
        const v = buffer[px + 3];

        ids.push(id);
        zs.push(z);
        uvs.push(new Vector2(u, v));
        return null;
    });

    return { ids, uvs, zs };
}

/**
 * Pick tiles from a map object. This does not do any sorting
 *
 * @param _instance Instance to pick from
 * @param canvasCoords Coordinates on the rendering canvas
 * @param map Map object to pick from
 * @param options Options
 * @returns Target
 */
function pickTilesAt(
    _instance: Instance,
    canvasCoords: Vector2,
    map: Map,
    options: PickOptions = {},
) {
    const radius = options.radius ?? 0;
    const limit = options.limit ?? Infinity;
    const filter = options.filter;
    const target: MapPickResult[] = [];

    const { ids, uvs, zs } = renderTileBuffer(
        _instance,
        map,
        canvasCoords,
        radius,
    );

    const extent = map.extent;
    const crs = extent.crs();

    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const uv = uvs[i];
        const z = zs[i];

        const tile = map.tileIndex.getTile(id) as TileMesh;

        if (tile && tile.isTileMesh) {
            const ex = tile.extent;
            tmpCoords.set(
                crs,
                ex.west() + uv.x * (ex.east() - ex.west()),
                ex.south() + uv.y * (ex.north() - ex.south()),
                0,
            );

            const elevation = z;

            if (elevation != null) {
                tmpCoords.values[2] = elevation;
                // convert to instance crs
                // here (and only here) should be the Coordinates instance creation
                const coord = tmpCoords.as(_instance.referenceCrs);
                const point = tmpCoords.toVector3(new Vector3());

                const p: MapPickResult = {
                    object: tile,
                    entity: map,
                    point,
                    coord,
                    distance: _instance.camera.camera3D.position.distanceTo(point),
                };

                if (!filter || filter(p)) {
                    target.push(p);

                    if (target.length >= limit) {
                        break;
                    }
                }
            }
        }
    }

    return target;
}

export default pickTilesAt;
