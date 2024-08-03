import { Object3D } from 'three';
import type LineStringMesh from './LineStringMesh';
import type SurfaceMesh from './SurfaceMesh';
import type SimpleGeometryMesh from './SimpleGeometryMesh';
import type { DefaultUserData, SimpleGeometryMeshEventMap } from './SimpleGeometryMesh';
import type { Polygon } from 'ol/geom';

/**
 * Represents a single polygon geometry, including the surface and the rings.
 */
export default class PolygonMesh<UserData extends DefaultUserData = DefaultUserData>
    extends Object3D<SimpleGeometryMeshEventMap>
    implements SimpleGeometryMesh
{
    readonly isSimpleGeometryMesh = true as const;
    readonly isPolygonMesh = true as const;
    readonly type = 'PolygonMesh' as const;

    readonly isExtruded: boolean = false;

    private _featureOpacity = 1;
    private _surface?: SurfaceMesh<UserData>;
    private _linearRings?: LineStringMesh<UserData>[];
    readonly source: Polygon;

    // @ts-expect-error assigned in the parent class
    userData: UserData;

    get surface(): SurfaceMesh<UserData> | undefined {
        return this._surface;
    }

    set surface(newSurface: SurfaceMesh<UserData>) {
        this._surface?.dispose();
        this._surface?.removeFromParent();
        this._surface = newSurface;

        if (newSurface) {
            newSurface.opacity = this._featureOpacity;
            this.add(newSurface);
            this.updateMatrixWorld(true);
        }
    }

    get linearRings(): LineStringMesh<UserData>[] | undefined {
        return this._linearRings;
    }

    set linearRings(newRings: LineStringMesh<UserData>[] | undefined) {
        this._linearRings?.forEach(ring => {
            ring.removeFromParent();
            ring.dispose();
        });
        this._linearRings = newRings;
        if (newRings) {
            newRings.forEach(ring => (ring.opacity = this._featureOpacity));
            this.add(...newRings);
            this.updateMatrixWorld(true);
        }
    }

    set opacity(opacity: number) {
        this._featureOpacity = opacity;
        if (this._surface) {
            this._surface.opacity = opacity;
        }
        if (this.linearRings) {
            this.linearRings.forEach(ring => (ring.opacity = opacity));
        }
    }

    constructor(options: {
        source: Polygon;
        surface?: SurfaceMesh<UserData>;
        linearRings?: LineStringMesh<UserData>[];
        isExtruded?: boolean;
    }) {
        super();

        this.matrixAutoUpdate = false;

        this.source = options.source;
        this._surface = options.surface;
        this._linearRings = options.linearRings;
        this.isExtruded = options.isExtruded ?? false;

        if (this._surface) {
            this.add(this._surface);
        }
        if (this._linearRings) {
            this.add(...this._linearRings);
        }
    }

    dispose() {
        this._surface?.dispose();
        this._linearRings?.forEach(ring => ring.dispose());
        this.dispatchEvent({ type: 'dispose' });
    }
}

export function isPolygonMesh(obj: unknown): obj is PolygonMesh {
    return (obj as PolygonMesh)?.isPolygonMesh ?? false;
}
