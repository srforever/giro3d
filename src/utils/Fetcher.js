/**
 * @module utils/Fetcher
 */

function checkResponse(response) {
    if (!response.ok) {
        const error = new Error(`Error loading ${response.url}: status ${response.status}`);
        error.response = response;
        throw error;
    }
}

export default {
    /**
     * Wrapper over `fetch`.
     *
     * @param {string} url the URL to fetch
     * @param {object} options fetch options (passed directly to fetch)
     * @returns {Promise<Response>} The response blob.
     */
    async fetch(url, options = {}) {
        const response = await fetch(url, options);
        checkResponse(response);
        return response;
    },

    /**
     * Wrapper over `fetch`, then returns the blob of the response.
     *
     * @param {string} url the URL to fetch
     * @param {object} options fetch options (passed directly to fetch)
     * @returns {Promise<Blob>} The response blob.
     */
    async blob(url, options = {}) {
        const response = await fetch(url, options);
        checkResponse(response);
        return response.blob();
    },

    /**
     * Wrapper over `fetch` to get some text
     *
     * @api
     * @param {string} url the URL to fetch
     * @param {object} options fetch options (passed directly to fetch)
     * @returns {Promise} the promise containing the text
     */
    text(url, options = {}) {
        return fetch(url, options).then(response => {
            checkResponse(response);
            return response.text();
        });
    },

    /**
     * Wrapper over `fetch` to get some JSON
     *
     * @api
     * @param {string} url the URL to fetch
     * @param {object} options fetch options (passed directly to fetch)
     * @returns {Promise} the promise containing the JSON
     */
    json(url, options = {}) {
        return fetch(url, options).then(response => {
            checkResponse(response);
            return response.json();
        });
    },

    /**
     * Wrapper over `fetch` to get some XML.
     *
     * @api
     * @param {string} url the URL to fetch
     * @param {object} options fetch options (passed directly to fetch)
     * @returns {Promise} the promise containing the XML
     */
    xml(url, options = {}) {
        return fetch(url, options).then(response => {
            checkResponse(response);
            return response.text();
        }).then(text => new window.DOMParser().parseFromString(text, 'text/xml'));
    },

    /**
     * Wrapper over `fetch` to get some `ArrayBuffer`
     *
     * @param {string} url the URL to fetch
     * @param {object} options fetch options (passed directly to fetch)
     * @returns {Promise} the promise containing the ArrayBuffer
     */
    arrayBuffer(url, options = {}) {
        return fetch(url, options).then(response => {
            checkResponse(response);
            return response.arrayBuffer();
        });
    },
};
