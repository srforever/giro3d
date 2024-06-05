/**
 * Binds a toggle switch or checkbox.
 * @param {string} id The id of the <input> element.
 * @param {(v: boolean) => void} onChange The callback when the dropdown value changes.
 * @returns {(v: boolean) => void} The function to update the value from outside.
 */
export function bindToggle(id, onChange) {
    /** @type {HTMLInputElement} */
    const toggle = document.getElementById(id);

    toggle.oninput = function oninput() {
        onChange(toggle.checked);
    };

    return v => {
        toggle.checked = v;
        onChange(toggle.checked);
    };
}
