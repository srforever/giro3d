const examples = [];

function executeSearchQuery(elem) {
    const query = elem.target.value.toLowerCase().trim();

    // an empty query shows all examples
    if (!query || query === '') {
        examples.forEach(o => {
            o.disabled = false;
        });
    }

    const re = new RegExp(query);

    examples.forEach(o => {
        const visible = re.test(o.name) || re.test(o.description);

        o.element.style.display = visible ? o.display : 'none';
    });
}

function collectExamples() {
    document
        .querySelectorAll("[id^='example-card']")
        .forEach(e => {
            const obj = {};
            obj.element = e;
            obj.name = e.querySelector("[id^='example-title'").innerHTML.toLowerCase();
            obj.description = e.querySelector("[id^='example-desc'").innerHTML.toLowerCase();
            obj.display = e.style.display;
            examples.push(obj);
        });
}

function init() {
    collectExamples();

    registerEvents();
}

window.addEventListener('DOMContentLoaded', init);
function registerEvents() {
    const searchBox = document.getElementById('keywords');
    searchBox.addEventListener('input', executeSearchQuery);
}

