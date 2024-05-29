import colormap from 'colormap';
import { Color } from 'three';

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

/**
 * Binds a button.
 * @param {string} id The id of the <button> element.
 * @param {() => void} onClick The click handler.
 */
export function bindButton(id, onClick) {
    document.getElementById(id).onclick = () => {
        onClick();
    };
}

/**
 * @typedef {"jet"|"hsv"|"hot"|"spring"|"summer"|"autumn"|"winter"|"bone"|"copper"|"greys"|"yignbu"|"greens"|"yiorrd"|"bluered"|"rdbu"|"picnic"|"rainbow"|"portland"|"blackbody"|"earth"|"electric"|"alpha"|"viridis"|"inferno"|"magma"|"plasma"|"warm"|"cool"|"rainbow-soft"|"bathymetry"|"cdom"|"chlorophyll"|"density"|"freesurface-blue"|"freesurface-red"|"oxygen"|"par"|"phase"|"salinity"|"temperature"|"turbidity"|"velocity-blue"|"velocity-green"|"cubehelix"} ColorRampPreset
 */

/**
 * Create an array of {@link Color}s from the specified colormap preset.
 * @param {ColorRampPreset} preset The name of the colormap preset.
 * @param {boolean} [discrete=false] If `true`, the color array will have 10 steps, otherwise 256.
 * @param {boolean} [invert=false] If `true`, the color array will be reversed.
 * @returns {Color[]} The color array.
 */
export function makeColorRamp(preset, discrete = false, invert = false, mirror = false) {
    let nshades = discrete ? 10 : 256;

    const values = colormap({ colormap: preset, nshades });
    const colors = values.map(v => new Color(v));

    if (invert) {
        colors.reverse();
    }

    if (mirror) {
        const mirrored = [...colors, ...colors.reverse()];
        return mirrored;
    }

    return colors;
}
