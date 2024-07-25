import { Line2 } from 'three/examples/jsm/lines/Line2';
import type SimpleGeometryMesh from './SimpleGeometryMesh';
import { type DefaultUserData } from './SimpleGeometryMesh';
import type { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import type { WebGLRenderer } from 'three';

export default class LineStringMesh<UserData extends DefaultUserData = DefaultUserData>
    extends Line2
    implements SimpleGeometryMesh<UserData>
{
    readonly isSimpleGeometryMesh = true as const;
    readonly isLineStringMesh = true as const;
    readonly type = 'LineStringMesh' as const;

    private _featureOpacity = 1;
    private _styleOpacity = 1;

    userData: UserData;

    constructor(geometry: LineGeometry, material: LineMaterial, opacity: number) {
        super(geometry, material);
        this.matrixAutoUpdate = false;
        this._styleOpacity = opacity;
    }

    dispose() {
        this.geometry.dispose();
        // Don't dispose the material as it is not owned by this mesh.

        // @ts-expect-error dispose is not known because the types for three.js
        // "forget" to expose event map to subclasses.
        this.dispatchEvent({ type: 'dispose' });
    }

    update(options: { material: LineMaterial; opacity: number }) {
        if (options.material) {
            this.material = options.material;
            this._styleOpacity = options.opacity;
            this.updateOpacity();
            this.visible = true;
        } else {
            this.visible = false;
        }
    }

    private updateOpacity() {
        this.material.opacity = this._styleOpacity * this._featureOpacity;
        this.material.transparent = this.material.opacity < 1;
    }

    onBeforeRender(renderer: WebGLRenderer): void {
        // We have to specify the screen size to be able to properly render
        // lines that have a width in pixels. Note that this should be automatically done
        // by three.js in the future, but for now we have to do it manually.
        const { width, height } = renderer.getRenderTarget() ?? renderer.getContext().canvas;
        this.material.resolution.set(width, height);
    }

    set opacity(opacity: number) {
        this._featureOpacity = opacity;
        this.updateOpacity();
    }
}

export function isLineStringMesh<UserData extends DefaultUserData = DefaultUserData>(
    obj: unknown,
): obj is LineStringMesh<UserData> {
    return (obj as LineStringMesh)?.isLineStringMesh ?? false;
}
