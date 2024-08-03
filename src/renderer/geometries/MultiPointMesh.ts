import { Object3D } from 'three';
import type SimpleGeometryMesh from './SimpleGeometryMesh';
import type { DefaultUserData, SimpleGeometryMeshEventMap } from './SimpleGeometryMesh';
import type PointMesh from './PointMesh';
import { isPointMesh } from './PointMesh';

export default class MultiPointMesh<UserData extends DefaultUserData = DefaultUserData>
    extends Object3D<SimpleGeometryMeshEventMap>
    implements SimpleGeometryMesh<UserData>
{
    readonly isSimpleGeometryMesh = true as const;
    readonly isMultiPointMesh = true as const;
    readonly type = 'MultiPointMesh' as const;

    // @ts-expect-error assigned in the parent class
    userData: UserData;

    constructor(points: PointMesh[]) {
        super();
        this.add(...points);
    }

    set opacity(opacity: number) {
        this.traversePoints(p => (p.opacity = opacity));
    }

    /**
     * Executes the callback on all the {@link PointMesh}es of this mesh.
     * @param callback - The callback to execute.
     */
    traversePoints(callback: (polygon: PointMesh) => void) {
        this.traverse(obj => {
            if (isPointMesh(obj)) {
                callback(obj);
            }
        });
    }

    dispose(): void {
        this.traversePoints(p => p.dispose());
        this.dispatchEvent({ type: 'dispose' });
    }
}

export function isMultiPointMesh(obj: unknown): obj is MultiPointMesh {
    return (obj as MultiPointMesh)?.isMultiPointMesh ?? false;
}
