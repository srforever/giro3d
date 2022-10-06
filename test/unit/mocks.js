/* eslint-disable class-methods-use-this */

export const resizeObservers = [];

class ResizeObserver {
    constructor() {
        this.observe = jest.fn();
        this.unobserve = jest.fn();
        this.disconnect = jest.fn();

        resizeObservers.push(this);
    }
}

/**
 * Setups the global scope mocks necessary for some unit tests that interacts
 * with the `window` object.
 */
// eslint-disable-next-line import/prefer-default-export
export function setupGlobalMocks() {
    window.ResizeObserver = ResizeObserver;
}
