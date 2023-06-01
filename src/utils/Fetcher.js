/**
 * @module utils/Fetcher
 */

import { Texture } from 'three';
import HttpConfiguration from './HttpConfiguration.js';
import TextureGenerator from './TextureGenerator.js';
import HttpQueue from './HttpQueue.js';

/**
 * Throws an exception if the response ended with an error HTTP code.
 *
 * @param {Response} response The response.
 */
function checkResponse(response) {
    if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText} - ${response.url}`);
        error.response = response;
        throw error;
    }
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
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<Response>} The response blob.
 */
async function _fetch(url, options = {}) {
    HttpConfiguration.applyConfiguration(url, options);
    const req = new Request(url, options);
    const response = await enqueue(req);
    checkResponse(response);
    return response;
}

/**
 * Wrapper over `fetch`, then returns the blob of the response.
 *
 * @api
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<Blob>} The response blob.
 */
async function blob(url, options = {}) {
    const response = await _fetch(url, options);
    checkResponse(response);
    return response.blob();
}

/**
 * Wrapper over `fetch` to get some text
 *
 * @api
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<string>} the promise containing the text
 */
async function text(url, options = {}) {
    const response = await _fetch(url, options);
    checkResponse(response);
    return response.text();
}

/**
 * Wrapper over `fetch` to get some JSON
 *
 * @api
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<any>} the promise containing the JSON
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
 */
async function texture(url, options = {}) {
    const data = await blob(url, options);
    const tex = await TextureGenerator.decodeBlob(data);
    return tex;
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
};
