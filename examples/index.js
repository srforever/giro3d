const examples = [];

function executeSearchQuery(elem) {
    const query = elem.target.value.trim();

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
        .querySelectorAll('.col')
        .forEach(e => {
            const obj = {};
            obj.element = e;
            obj.name = e.querySelector('.card-title').innerHTML.toLowerCase();
            obj.description = e.querySelector('.card-text').innerHTML.toLowerCase();
            obj.display = e.style.display;
            examples.push(obj);
        });
}

function init() {
    collectExamples();

    registerEvents();
}

window.addEventListener('load', init);
function registerEvents() {
    const searchBox = document.getElementById('keywords');
    searchBox.addEventListener('input', executeSearchQuery);
}
