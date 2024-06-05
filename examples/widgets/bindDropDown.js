/**
 * Binds a text-value dropdown.
 * @param {string} id The id of the <input> element.
 * @param {(v: string) => void} onChange The callback when the dropdown value changes.
 * @returns {(v: string) => void} The function to update the value from outside.
 */
export function bindDropDown(id, onChange) {
    /** @type {HTMLInputElement} */
    const mode = document.getElementById(id);
    mode.onchange = () => {
        onChange(mode.value);
    };

    return v => {
        mode.value = v;
        onChange(mode.value);
    };
}
