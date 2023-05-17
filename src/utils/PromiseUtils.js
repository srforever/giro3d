/**
 * Returns a promise that will resolve after the specified duration.
 *
 * @param {number} duration The duration, in milliseconds.
 * @returns {Promise} The promise.
 */
function delay(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

export default {
    delay,
};
