/**
 * @module utils/Fetcher
 */

import { EventDispatcher, Texture } from 'three';
import HttpConfiguration from './HttpConfiguration.js';
import TextureGenerator from './TextureGenerator.js';
import HttpQueue from './HttpQueue.js';

/**
 * Fires when a Network or HTTP error occured during fetch
 *
 * @api
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

class FetcherEventDispatcher extends EventDispatcher { }

const _eventTarget = new FetcherEventDispatcher();

/**
 * Adds a listener to an event type on fetch operations.
 *
 * @api
 * @param {string} type The type of event to listen to - only `error` is supported.
 * @param {Function} listener The function that gets called when the event is fired.
 */
function addEventListener(type, listener) {
    _eventTarget.addEventListener(type, listener);
}

/**
 * Checks if listener is added to an event type.
 *
 * @api
 * @param {string} type The type of event to listen to - only `error` is supported.
 * @param {Function} listener The function that gets called when the event is fired.
 * @returns {boolean} `true` if the listener is added to this event type.
 */
function hasEventListener(type, listener) {
    return _eventTarget.hasEventListener(type, listener);
}

/**
 * Removes a listener from an event type on fetch operations.
 *
 * @api
 * @param {string} type The type of the listener that gets removed.
 * @param {Function} listener The listener function that gets removed.
 */
function removeEventListener(type, listener) {
    _eventTarget.removeEventListener(type, listener);
}

/**
 * @type {Map<string, HttpQueue>}
 */
const hostQueues = new Map();

/**
 * Queue an HTTP request.
 *
 * @param {Request} req The request to queue.
 */
function enqueue(req) {
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

/**
 * Wrapper over [`fetch()`](https://developer.mozilla.org/en-US/docs/Web/API/fetch).
 *
 * Use this function instead of calling directly the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
 * to benefit from automatic configuration from the
 * {@link module:utils/HttpConfiguration HttpConfiguration} module.
 *
 * @api
 * @name fetch
 * @function
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<Response>} The response object.
 * @fires module:utils/Fetcher#error On Network/HTTP error
 */
async function _fetch(url, options = {}) {
    HttpConfiguration.applyConfiguration(url, options);
    const req = new Request(url, options);
    const response = await enqueue(req).catch(error => {
        _eventTarget.dispatchEvent({ type: 'error', error });
        throw error;
    });
    if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText} - ${response.url}`);
        error.response = response;
        _eventTarget.dispatchEvent({ type: 'error', error });
        throw error;
    }
    return response;
}

/**
 * Wrapper over `fetch`, then returns the blob of the response.
 *
 * @api
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<Blob>} The response blob.
 * @fires module:utils/Fetcher#error On Network/HTTP error
 */
async function blob(url, options = {}) {
    const response = await _fetch(url, options);
    return response.blob();
}

/**
 * Wrapper over `fetch` to get some text
 *
 * @api
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<string>} the promise containing the text
 * @fires module:utils/Fetcher#error On Network/HTTP error
 */
async function text(url, options = {}) {
    const response = await _fetch(url, options);
    return response.text();
}

/**
 * Wrapper over `fetch` to get some JSON
 *
 * @api
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<any>} the promise containing the JSON
 * @fires module:utils/Fetcher#error On Network/HTTP error
 */
async function json(url, options = {}) {
    const response = await _fetch(url, options);
    return response.json();
}

/**
 * Wrapper over `fetch` to get some XML.
 *
 * @api
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<Document>} the promise containing the XML
 * @fires module:utils/Fetcher#error On Network/HTTP error
 */
async function xml(url, options = {}) {
    const response = await _fetch(url, options);
    const txt = await response.text();
    return new window.DOMParser().parseFromString(txt, 'text/xml');
}

/**
 * Wrapper over `fetch` to get some `ArrayBuffer`
 *
 * @api
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<ArrayBuffer>} the promise containing the ArrayBuffer
 * @fires module:utils/Fetcher#error On Network/HTTP error
 */
async function arrayBuffer(url, options = {}) {
    const response = await _fetch(url, options);
    return response.arrayBuffer();
}

/**
 * Downloads a remote image and converts it into a texture.
 *
 * @api
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<Texture>} the promise containing the texture
 * @fires module:utils/Fetcher#error On Network/HTTP error
 */
async function texture(url, options = {}) {
    const data = await blob(url, options);
    return TextureGenerator.decodeBlob(data);
}

/**
 * Exposes an API to perform HTTP requests.
 * This should be used instead of the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
 * in order to benefit from some error-checking, automatic configuration (from the
 * {@link module:utils/HttpConfiguration HttpConfiguration} module), etc.
 *
 * @api
 */
export default {
    fetch: _fetch,
    xml,
    json,
    blob,
    texture,
    arrayBuffer,
    text,
    getInfo,
    addEventListener,
    hasEventListener,
    removeEventListener,
    _eventTarget, // Used for testing
};
