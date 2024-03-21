/**
 * Returns a promise that will resolve after the specified duration.
 *
 * @param duration - The duration, in milliseconds.
 * @returns The promise.
 */
function delay(duration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
}

export enum PromiseStatus {
    Fullfilled = 'fulfilled',
    Rejected = 'rejected',
}

export class AbortError extends Error {
    constructor() {
        super('aborted');
        this.name = 'AbortError';
    }
}

/**
 * Returns an Error with the 'aborted' reason.
 *
 * @returns The error.
 */
function abortError(): Error {
    return new AbortError();
}

export default {
    delay,
    PromiseStatus,
    abortError,
};
