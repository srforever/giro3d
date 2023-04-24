function createPropertyChangedEvent(target, propertyName, oldValue, newValue) {
    const event = {
        type: `${propertyName}-property-changed`,
        previous: {},
        new: {},
        target,
    };

    event.previous[propertyName] = oldValue;
    event.new[propertyName] = newValue;

    return event;
}

export default {
    createPropertyChangedEvent,
};
