/**
 * Trait for objects that have a unique owner.
 */
type UniqueOwner<T, Owner = unknown> = { owner: Owner; payload: T };

/**
 * Creates an {@link UniqueOwner} object with the specified owner and payload.
 * @param object - The owned payload.
 * @param owner - The owner.
 */
export function intoUniqueOwner<T, Owner = unknown>(object: T, owner: Owner) {
    return {
        payload: object,
        owner,
    };
}

export default UniqueOwner;
