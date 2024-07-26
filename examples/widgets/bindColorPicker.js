import { Color } from 'three';

export function bindColorPicker(id, onChange) {
    const colorPicker = document.getElementById(id);

    colorPicker.oninput = function oninput() {
        // Let's change the classification color with the color picker value
        const hexColor = colorPicker.value;
        onChange(hexColor);
    };

    return v => {
        colorPicker.value = `#${new Color(v).getHexString()}`;
        onChange(colorPicker.value);
    };
}
