/**
 * Custom error thrown when cancelling commands. Allows the caller to act differently if needed.
 *
 * @class
 * @param {object} command
 */
class CancelledCommandException {
    constructor(layer, requester) {
        this.layer = layer;
        this.requester = requester;
    }

    toString() {
        return `Cancelled command ${this.requester.id}/${this.layer.id}`;
    }
}
export default CancelledCommandException;
