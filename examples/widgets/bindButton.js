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
