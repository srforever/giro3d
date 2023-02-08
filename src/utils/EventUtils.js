function definePropertyWithChangeEvent(obj,
    propertyName,
    defaultValue,
    onChange) {
    const existing = Object.getOwnPropertyDescriptor(obj, propertyName);
    if (!existing || !existing.set) {
        let property = obj[propertyName] === undefined ? defaultValue : obj[propertyName];
        Object.defineProperty(obj,
            propertyName,
            {
                get: () => property,
                set: newValue => {
                    if (property !== newValue) {
                        const event = {
                            type: `${propertyName}-property-changed`,
                            previous: {},
                            new: {},
                        };
                        event.previous[propertyName] = property;
                        event.new[propertyName] = newValue;
                        property = newValue;
                        if (onChange) {
                            onChange(obj, propertyName);
                        }
                        obj.dispatchEvent(event);
                    }
                },
            });
    }
}

export default {
    definePropertyWithChangeEvent,
};
