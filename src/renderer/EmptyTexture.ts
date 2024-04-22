import { Texture } from 'three';

export default class EmptyTexture extends Texture {
    readonly isEmptyTexture = true;

    constructor() {
        super();
    }
}

export function isEmptyTexture(obj: unknown): obj is EmptyTexture {
    return (obj as EmptyTexture)?.isEmptyTexture;
}
