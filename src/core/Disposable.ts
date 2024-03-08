/**
 * Trait of objects that hold unmanaged resources.
 */
export default interface Disposable {
    /**
     * Releases unmanaged resources from this object.
     */
    dispose(): void;
}

export function isDisposable(object: unknown): object is Disposable {
    if (typeof (object as Disposable).dispose === 'function') {
        return true;
    }

    return false;
}
