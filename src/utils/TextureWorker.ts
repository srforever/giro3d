import OperationCounter from '../core/OperationCounter';
import type Progress from '../core/Progress';
import type { DecodeMapboxTerrainResult, FillBufferResult } from './TextureGenerator';
import TextureGenerator, { type FillBufferOptions } from './TextureGenerator';

declare const self: DedicatedWorkerGlobalScope;
export {};

export type MessageBase = {
    id: number;
};

export type ResponseBase = {
    requestId: number;
};

export type DecodeMapboxTerrainMessage = MessageBase & {
    type: 'DecodeMapboxTerrain';
    options: { source: ImageBitmap };
};

export type DecodeMapboxTerrainResponse = ResponseBase & {
    float32Array: ArrayBuffer;
    width: number;
    height: number;
};

export type FillBufferMessage = MessageBase & {
    type: 'FillBuffer';
    options: FillBufferOptions<ArrayBuffer>;
};

export type FillBufferResponse = ResponseBase & {
    buffer: ArrayBuffer;
    min: number;
    max: number;
    isTransparent: boolean;
};

export type Message = FillBufferMessage | DecodeMapboxTerrainMessage;

function processMapboxTerrain(msg: DecodeMapboxTerrainMessage) {
    const canvas = msg.options.source;

    const result = TextureGenerator.decodeMapboxTerrainImage(canvas);

    const response: DecodeMapboxTerrainResponse = {
        requestId: msg.id,
        float32Array: result.data.buffer,
        width: result.width,
        height: result.height,
    };
    self.postMessage(response, [response.float32Array]);
}

function processFillBufferMessage(msg: FillBufferMessage) {
    const typedBuffers = msg.options.input.map(buf =>
        TextureGenerator.createTypedArray(buf, msg.options.sourceDataType),
    );

    const result = TextureGenerator.fillBuffer({
        ...msg.options,
        input: typedBuffers,
    });
    const response: FillBufferResponse = {
        requestId: msg.id,
        buffer: result.buffer,
        min: result.min,
        max: result.max,
        isTransparent: result.isTransparent,
    };
    self.postMessage(response, [result.buffer.buffer]);
}

self.onmessage = (event: MessageEvent<Message>) => {
    const msg = event.data;

    switch (msg.type) {
        case 'FillBuffer':
            processFillBufferMessage(msg);
            break;
        case 'DecodeMapboxTerrain':
            processMapboxTerrain(msg);
            break;
        default:
            break;
    }
};

export interface MessageType {
    FillBuffer: { request: FillBufferMessage; response: FillBufferResponse };
}

let messageId = 0;

export default class TextureWorker implements Progress {
    readonly worker: Worker;

    private readonly _counter = new OperationCounter();

    constructor(worker: Worker) {
        this.worker = worker;
    }

    get loading(): boolean {
        return this._counter.loading;
    }

    get progress(): number {
        return this._counter.progress;
    }

    decodeMapboxTerrainImageAsync(source: ImageBitmap): Promise<DecodeMapboxTerrainResult> {
        if (!window.Worker) {
            return Promise.resolve(TextureGenerator.decodeMapboxTerrainImage(source));
        }

        const id = messageId++;

        this._counter.increment();

        return new Promise(resolve => {
            this.worker.addEventListener('message', event => {
                const response = event.data as ResponseBase;

                // Ensure that we are handling the correct message
                if (response.requestId === id) {
                    const decodeResponse = response as DecodeMapboxTerrainResponse;
                    const { width, height, float32Array } = decodeResponse;

                    this._counter.decrement();
                    resolve({ data: new Float32Array(float32Array), width, height });
                }
            });

            const msg: DecodeMapboxTerrainMessage = {
                id,
                type: 'DecodeMapboxTerrain',
                options: { source },
            };

            this.worker.postMessage(msg, [source]);
        });
    }

    fillBufferAsync(options: FillBufferOptions): Promise<FillBufferResult> {
        if (!window.Worker) {
            return Promise.resolve(TextureGenerator.fillBuffer(options));
        }

        const id = messageId++;

        this._counter.increment();

        return new Promise(resolve => {
            this.worker.addEventListener('message', event => {
                const response = event.data as ResponseBase;

                // Ensure that we are handling the correct message
                if (response.requestId === id) {
                    const fillBufferResponse = response as FillBufferResponse;
                    const arrayBuffer = fillBufferResponse.buffer;
                    const { min, max, isTransparent } = fillBufferResponse;

                    const arrayType = TextureGenerator.getTypedArrayTypeFromTextureDataType(
                        options.dataType,
                    );
                    const buffer = TextureGenerator.createTypedArray(arrayBuffer, arrayType);

                    this._counter.decrement();
                    resolve({ buffer, min, max, isTransparent });
                }
            });

            // TODO error handling

            // we have to clone the buffers because once they are sent to the web worker,
            // they cannot be used again. In the case that those buffers were taken from
            // the cache, it means that it would make the cached buffers unuseable.
            const clonedBuffers = options.input.map(b => b.buffer.slice(0));

            const msg: FillBufferMessage = {
                id,
                type: 'FillBuffer',
                options: {
                    ...options,
                    input: clonedBuffers,
                },
            };

            this.worker.postMessage(msg, clonedBuffers);
        });
    }
}
