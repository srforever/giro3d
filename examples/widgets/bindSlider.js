/**
 * Binds a {@link HTMLInputElement} in slider mode.
 * @param {string} id The id of the <input> element.
 * @param {(v: number) => void} onChange The callback when the slider value changes.
 * @returns {(v: number) => void} The function to update the value from outside.
 */
export function bindSlider(id, onChange) {
    /** @type {HTMLInputElement} */
    const slider = document.getElementById(id);
    slider.oninput = function oninput() {
        onChange(slider.valueAsNumber);
    };

    return v => {
        slider.valueAsNumber = v;
        onChange(slider.valueAsNumber);
    };
}
