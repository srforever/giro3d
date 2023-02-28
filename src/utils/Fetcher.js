/**
 * @module utils/Fetcher
 */

import HttpConfiguration from './HttpConfiguration.js';

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
    const response = await fetch(req);
    checkResponse(response);
    return response;
}

/**
 * Wrapper over `fetch`, then returns the blob of the response.
 *
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
 * @param {string} url the URL to fetch
 * @param {object} options fetch options (passed directly to `fetch()`)
 * @returns {Promise<ArrayBuffer>} the promise containing the ArrayBuffer
 */
async function arrayBuffer(url, options = {}) {
    const response = await _fetch(url, options);
    return response.arrayBuffer();
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
    arrayBuffer,
    text,
};
