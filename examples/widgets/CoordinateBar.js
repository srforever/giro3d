function bind(instance) {
    // Bind events
    instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));
    const coordinates = document.getElementById('coordinates');
    instance.domElement.addEventListener('mousemove', e => {
        const picked = instance.pickObjectsAt(e, { limit: 1 }).at(0);
        if (picked) {
            coordinates.classList.remove('d-none');
            coordinates.textContent = `x: ${picked.point.x.toFixed(2)}, y: ${picked.point.y.toFixed(2)}, z: ${picked.point.z.toFixed(2)}`;
        } else {
            coordinates.classList.add('d-none');
        }
    });
}

export default { bind };
