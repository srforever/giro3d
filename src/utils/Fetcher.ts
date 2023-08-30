import {
    EventDispatcher,
    type EventListener,
    type Texture,
} from 'three';
import HttpConfiguration from './HttpConfiguration';
import TextureGenerator from './TextureGenerator';
import HttpQueue from './HttpQueue';

export interface FetcherEventMap {
    error: { error: Error };
}

/**
 * Fires when a Network or HTTP error occured during fetch
 *
 * @event module:utils/Fetcher#error
 * @property {Error} error Error thrown
 * @property {Response?} error.response HTTP response (if any)
 * @example
 * Fetcher.addEventListener('error', (error) => {
 *     if (error.response && error.response.status === 401) {
 *        console.error(
 *            `Unauthorized to access resource ${error.response.url}: ${error.message}`,
 *            error,
 *        );
 *    } else {
 *        console.error('Got an error while fetching resource', error);
 *    }
 * });
 */

class FetcherEventDispatcher extends EventDispatcher<FetcherEventMap> { }

const eventTarget = new FetcherEventDispatcher();

/**
 * Adds a listener to an event type on fetch operations.
 *
 * @param type The type of event to listen to - only `error` is supported.
 * @param listener The function that gets called when the event is fired.
 */
function addEventListener<T extends keyof FetcherEventMap>(
    type: T,
    listener: EventListener<FetcherEventMap[T], T, FetcherEventDispatcher>,
) {
    eventTarget.addEventListener(type, listener);
}

/**
 * Checks if listener is added to an event type.
 *
 * @param type The type of event to listen to - only `error` is supported.
 * @param listener The function that gets called when the event is fired.
 * @returns `true` if the listener is added to this event type.
 */
function hasEventListener<T extends keyof FetcherEventMap>(
    type: T,
    listener: EventListener<FetcherEventMap[T], T, FetcherEventDispatcher>,
): boolean {
    return eventTarget.hasEventListener(type, listener);
}

/**
 * Removes a listener from an event type on fetch operations.
 *
 * @param type The type of the listener that gets removed.
 * @param listener The listener function that gets removed.
 */
function removeEventListener<T extends keyof FetcherEventMap>(
    type: T,
    listener: EventListener<FetcherEventMap[T], T, FetcherEventDispatcher>,
) {
    eventTarget.removeEventListener(type, listener);
}

const hostQueues: Map<string, HttpQueue> = new Map();

/**
 * Queue an HTTP request.
 *
 * @param req The request to queue.
 */
function enqueue(req: Request) {
    const url = new URL(req.url);
    if (!hostQueues.has(url.hostname)) {
        const queue = new HttpQueue();
        hostQueues.set(url.hostname, queue);
    }
    return hostQueues.get(url.hostname).enqueue(req);
}

function getInfo() {
    let pending = 0;
    let running = 0;
    hostQueues.forEach(queue => {
        pending += queue.size;
        running += queue.concurrentRequests;
    });
    return { pending, running };
}

interface ErrorWithResponse extends Error {
    response: Response;
}

/**
 * Wrapper over [`fetch()`](https://developer.mozilla.org/en-US/docs/Web/API/fetch).
 *
 * Use this function instead of calling directly the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
 * to benefit from automatic configuration from the {@link HttpConfiguration} module.
 *
 * @function
 * @param url the URL to fetch
 * @param options fetch options (passed directly to `fetch()`)
 * @returns The response object.
 * @fires error On Network/HTTP error
 */
async function fetchInternal(url: string, options?: RequestInit): Promise<Response> {
    HttpConfiguration.applyConfiguration(url, options);
    const req = new Request(url, options);
    const response = await enqueue(req).catch(error => {
        eventTarget.dispatchEvent({ type: 'error', error });
        throw error;
    });
    if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText} - ${response.url}`) as ErrorWithResponse;
        error.response = response;
        eventTarget.dispatchEvent({ type: 'error', error });
        throw error;
    }
    return response;
}

/**
 * Wrapper over `fetch`, then returns the blob of the response.
 *
 * @param url the URL to fetch
 * @param options fetch options (passed directly to `fetch()`)
 * @returns The response blob.
 * @fires error On Network/HTTP error
 */
async function blob(url: string, options?: RequestInit): Promise<Blob> {
    const response = await fetchInternal(url, options);
    return response.blob();
}

/**
 * Wrapper over `fetch` to get some text
 *
 * @param url the URL to fetch
 * @param options fetch options (passed directly to `fetch()`)
 * @returns the promise containing the text
 * @fires error On Network/HTTP error
 */
async function text(url: string, options?: RequestInit): Promise<string> {
    const response = await fetchInternal(url, options);
    return response.text();
}

/**
 * Wrapper over `fetch` to get some JSON
 *
 * @param url the URL to fetch
 * @param options fetch options (passed directly to `fetch()`)
 * @returns the promise containing the JSON
 * @fires error On Network/HTTP error
 */
async function json(url: string, options?: RequestInit): Promise<any> {
    const response = await fetchInternal(url, options);
    return response.json();
}

/**
 * Wrapper over `fetch` to get some XML.
 *
 * @param url the URL to fetch
 * @param options fetch options (passed directly to `fetch()`)
 * @returns the promise containing the XML
 * @fires error On Network/HTTP error
 */
async function xml(url: string, options?: RequestInit): Promise<Document> {
    const response = await fetchInternal(url, options);
    const txt = await response.text();
    return new window.DOMParser().parseFromString(txt, 'text/xml');
}

/**
 * Wrapper over `fetch` to get some `ArrayBuffer`
 *
 * @param url the URL to fetch
 * @param options fetch options (passed directly to `fetch()`)
 * @returns the promise containing the ArrayBuffer
 * @fires error On Network/HTTP error
 */
async function arrayBuffer(url: string, options?: RequestInit): Promise<ArrayBuffer> {
    const response = await fetchInternal(url, options);
    return response.arrayBuffer();
}

/**
 * Downloads a remote image and converts it into a texture.
 *
 * @param url the URL to fetch
 * @param options fetch options (passed directly to `fetch()`)
 * @returns the promise containing the texture
 * @fires error On Network/HTTP error
 */
async function texture(url: string, options?: RequestInit): Promise<Texture> {
    const data = await blob(url, options);
    return TextureGenerator.decodeBlob(data);
}

/**
 * Exposes an API to perform HTTP requests.
 * This should be used instead of the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
 * in order to benefit from some error-checking, automatic configuration (from the
 * {@link HttpConfiguration} module), etc.
 *
 */
export default {
    fetch: fetchInternal,
    xml,
    json,
    blob,
    texture,
    arrayBuffer,
    text,
    /** @ignore */
    getInfo,
    addEventListener,
    hasEventListener,
    removeEventListener,
    /** @ignore */
    _eventTarget: eventTarget, // Used for testing
};
