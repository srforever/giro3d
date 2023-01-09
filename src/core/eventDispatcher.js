import { EventDispatcher } from 'three';

// Wraps the Three.js EventDispatcher's methods into an
// object to be able to use it as a mixin.
const eventDispatcher = {
    dispatchEvent: EventDispatcher.prototype.dispatchEvent,
    addEventListener: EventDispatcher.prototype.addEventListener,
    hasEventListener: EventDispatcher.prototype.hasEventListener,
    removeEventListener: EventDispatcher.prototype.removeEventListener,
};

export default eventDispatcher;
