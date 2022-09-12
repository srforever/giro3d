/* global giro3d */
// eslint-disable-next-line no-unused-vars
// TODO remove this (or refacto heavily)
window.ToolTip = function ToolTip(instance, viewerDiv, tooltip, precisionPx) {
    let mouseDown = 0;
    const layers = instance.getLayers(l => l.protocol === 'rasterizer');

    document.body.onmousedown = function onmousedown() {
        ++mouseDown;
    };
    document.body.onmouseup = function onmouseup() {
        --mouseDown;
    };

    function buildToolTip(geoCoord, e) {
        let visible = false;
        const precision = instance.controls.pixelsToDegrees(precisionPx || 5);
        let i = 0;
        let p = 0;
        let id = 0;
        let layer;
        let result;
        let polygon;
        let color;
        let stroke;
        let name;
        let symb;
        let label;
        let line;
        let point;
        // var
        tooltip.innerHTML = '';
        tooltip.style.display = 'none';
        if (geoCoord) {
            visible = false;
            // convert degree precision
            for (i = 0; i < layers.length; i++) {
                layer = layers[i];
                result = giro3d.FeaturesUtils.filterFeaturesUnderCoordinate(
                    geoCoord, layer.feature, precision,
                );
                result.sort((a, b) => b.feature.type !== 'point');
                for (p = 0; p < result.length; p++) {
                    visible = true;
                    if (result[p].feature.type === 'polygon') {
                        polygon = result[p].feature;
                        color = polygon.properties.fill || layer.style.fill;
                        stroke = polygon.properties.stroke || layer.style.stroke;
                        name = `polygon${id}`;
                        symb = `<span id=${name} >&#9724</span>`;
                        tooltip.innerHTML += `${symb} ${polygon.properties.name || polygon.properties.nom || polygon.properties.description || layer.name}<br />`;
                        document.getElementById(name).style['-webkit-text-stroke'] = `1.25px ${stroke}`;
                        document.getElementById(name).style.color = color;
                        ++id;
                    } else if (result[p].feature.type === 'linestring') {
                        line = result[p].feature;
                        color = line.properties.stroke || layer.style.stroke;
                        symb = `<span style=color:${color};>&#9473</span>`;
                        tooltip.innerHTML += `${symb} ${line.name || layer.name}<br />`;
                    } else if (result[p].feature.type === 'point') {
                        point = result[p].feature;
                        color = 'white';
                        name = `point${id}`;
                        symb = `<span id=${name} style=color:${color};>&#9679</span>`;
                        label = point.properties.name || point.properties.description || layer.name;
                        tooltip.innerHTML += `<div>${symb} ${label}<br></div>`;
                        tooltip.innerHTML += `<span class=coord>long ${result[p].coordinates.longitude().toFixed(4)}<br /></span>`;
                        tooltip.innerHTML += `<span class=coord>lati &nbsp; ${result[p].coordinates.latitude().toFixed(4)}<br /></span>`;
                        document.getElementById(name).style['-webkit-text-stroke'] = '1px red';
                        ++id;
                    }
                }
            }
            if (visible) {
                tooltip.style.left = `${instance.eventToCanvasCoords(e).x}px`;
                tooltip.style.top = `${instance.eventToCanvasCoords(e).y}px`;
                tooltip.style.display = 'block';
            }
        }
    }

    function readPosition(e) {
        if (!mouseDown) {
            buildToolTip(instance.controls.pickGeoPosition(instance.eventToCanvasCoords(e)), e);
        } else {
            tooltip.style.left = `${instance.eventToCanvasCoords(e).x}px`;
            tooltip.style.top = `${instance.eventToCanvasCoords(e).y}px`;
        }
    }

    function pickPosition(e) {
        buildToolTip(instance.controls.pickGeoPosition(instance.eventToCanvasCoords(e)), e);
    }

    document.addEventListener('mousemove', readPosition, false);
    document.addEventListener('mousedown', pickPosition, false);
};
