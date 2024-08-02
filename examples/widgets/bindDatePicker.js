/**
 * Binds a date picker.
 * @param {string} id The id of the <input> element.
 * @param {(v: Date) => void} onChange The callback when the dropdown value changes.
 * @returns {(v: Date) => void} The function to update the value from outside.
 */
export function bindDatePicker(id, onChange) {
    /** @type {HTMLInputElement} */
    const input = document.getElementById(id);
    input.onchange = () => {
        onChange(new Date(input.value));
    };

    return v => {
        const clone = new Date(v.getTime());
        v.setMinutes(v.getMinutes() - v.getTimezoneOffset());
        input.value = clone.toISOString().slice(0, 10);
        onChange(new Date(input.value));
    };
}
