import * as dat from 'dat.gui';
import Fetcher from '../src/Provider/Fetcher.js';
import FirstPersonControls from '../src/Renderer/ThreeExtended/FirstPersonControls.js';
import Coordinates from '../src/Core/Geographic/Coordinates.js';
import PanoramaView from '../src/Core/Prefab/PanoramaView.js';
import Debug from '../utils/debug/Debug.js';
import createTileDebugUI from '../utils/debug/TileDebug.js';
import Panorama from '../src/Core/Prefab/Panorama/Constants.js';
import { STRATEGY_DICHOTOMY } from '../src/Core/layer/LayerUpdateStrategy.js';
import ColorLayer from '../src/Core/layer/ColorLayer.js';

const viewerDiv = document.getElementById('viewerDiv');

// Declare 5 panoramas
const urls = [
    'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/panoramas/arles/metadata1.json',
    'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/panoramas/arles/metadata2.json',
    'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/panoramas/arles/metadata3.json',
    'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/panoramas/arles/metadata4.json',
    'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/panoramas/arles/metadata5.json'];
const promises = urls.map(url => Fetcher.json(url, { crossOrigin: 'anonymous' }));

let activeIndex = 3;
Promise.all(promises).then(panoramas => {
    // Create a giro3d PanoramaView
    const instance = new PanoramaView(viewerDiv,
        new Coordinates('EPSG:3857'),
        Panorama.SPHERICAL);

    const layers = [];

    // Add one color layer per panorama
    for (let i = 0; i < panoramas.length; i++) {
        const pano = panoramas[i];
        const url = new URL(pano.images, urls[i]);
        const _id = url.pathname;
        instance.addLayer(new ColorLayer({
            visible: i === activeIndex,
            url: url.href,
            networkOptions: { crossOrigin: 'anonymous' },
            type: 'color',
            protocol: 'static',
            id: _id,
            projection: 'EPSG:4326',
            updateStrategy: {
                type: STRATEGY_DICHOTOMY,
            },
        })).then(l => {
            layers.push(l);
        });
    }
    instance.camera.camera3D.far = 10000;
    instance.notifyChange();

    // Setup debug menu
    const gui = new dat.GUI();
    const ddd = new Debug(instance, gui);
    createTileDebugUI(gui, instance, instance.baseLayer, ddd);

    // Add controls
    // eslint-disable-next-line no-unused-vars
    const controls = new FirstPersonControls(instance, {
        focusOnClick: true,
        panoramaRatio: panoramas[0].ratio,
        moveSpeed: 0,
    });

    // Change displayed panorama on mouse right-click
    document.addEventListener('contextmenu', evt => {
        evt.preventDefault();
        layers[activeIndex].visible = false;
        activeIndex = (activeIndex + 1) % 5;
        layers[activeIndex].visible = true;
        instance.notifyChange();
    });
    window.view = instance;

    document.addEventListener('click', evt => {
        const r = instance._objects[0].pickObjectsAt(instance, instance.eventToViewCoords(evt), 1);
        if (!r.length) return;
        const obj = r[0].object;
        console.log(obj);
        const svg = document.getElementsByClassName('maa')[0];
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }
        const colors = ['red', 'green', 'purple'];
        for (let i = 1; i < 4; i++) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', obj._a.sse[0].x.toFixed());
            line.setAttribute('y1', obj._a.sse[0].y.toFixed());
            line.setAttribute('x2', obj._a.sse[i].x.toFixed());
            line.setAttribute('y2', obj._a.sse[i].y.toFixed());
            line.setAttribute('stroke', colors[i - 1]);
            svg.append(line);
        }
    });
}).catch(console.error);
