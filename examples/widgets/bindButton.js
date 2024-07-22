/**
 * Binds a button.
 * @param {string} id The id of the <button> element.
 * @param {(button: HTMLButtonElement) => void} onClick The click handler.
 * @returns {HTMLButtonElement} The button element.
 */
export function bindButton(id, onClick) {
    const element = document.getElementById(id);
    element.onclick = () => {
        onClick(element);
    };

    return element;
}
