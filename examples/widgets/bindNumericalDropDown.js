/**
 * Binds a numerical dropdown.
 * @param {string} id The id of the <input> element.
 * @param {(v: number) => void} onChange The callback when the dropdown value changes.
 * @returns {(v: number) => void} The function to update the value from outside.
 */
export function bindNumericalDropDown(id, onChange) {
    /** @type {HTMLInputElement} */
    const value = document.getElementById(id);
    value.onchange = () => {
        onChange(value.valueAsNumber);
    };

    return v => {
        value.valueAsNumber = v;
        onChange(value.valueAsNumber);
    };
}
