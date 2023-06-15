/**
 * Returns a promise that will resolve after the specified duration.
 *
 * @param {number} duration The duration, in milliseconds.
 * @returns {Promise} The promise.
 */
function delay(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

/**
 * @enum
 * @readonly
 */
export const PromiseStatus = {
    /** @type {string} */
    Fullfilled: 'fulfilled',
    /** @type {string} */
    Rejected: 'rejected',
};

export default {
    delay,
    PromiseStatus,
};
