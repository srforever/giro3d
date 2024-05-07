import utf8Decoder from '../utils/Utf8Decoder';

export type ComponentType =
    | 'BYTE'
    | 'UNSIGNED_BYTE'
    | 'SHORT'
    | 'UNSIGNED_SHORT'
    | 'INT'
    | 'UNSIGNED_INT'
    | 'FLOAT'
    | 'DOUBLE';

export type ElementType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4';

export type Accessor<
    Type extends ElementType = ElementType,
    Component extends ComponentType = ComponentType,
> = {
    byteOffset: number;
    type: Type;
    componentType: Component;
};

export type BatchTable = Record<string, Accessor>;

export default {
    /**
     * Parse batch table buffer and convert to JSON
     *
     * @param buffer - the batch table buffer.
     * @returns a promise that resolves with a JSON object.
     */
    parse(buffer: ArrayBuffer): Promise<BatchTable> {
        const content = utf8Decoder.decode(new Uint8Array(buffer));
        const json = JSON.parse(content);
        return Promise.resolve(json);
    },
};
