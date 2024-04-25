import colormap from 'colormap';
import {
    BufferGeometry,
    Color,
    CurvePath,
    Line,
    LineBasicMaterial,
    LineCurve,
    Mesh,
    MeshBasicMaterial,
    SphereGeometry,
    Vector2,
    Vector3,
} from 'three';
import * as ChartJS from 'chart.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import XYZ from 'ol/source/XYZ.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import GeoTIFFFormat from '@giro3d/giro3d/formats/GeoTIFFFormat.js';
import ColorMap, { ColorMapMode } from '@giro3d/giro3d/core/layer/ColorMap.js';

import StatusBar from './widgets/StatusBar.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import DrawTool from '@giro3d/giro3d/interactions/DrawTool.js';

const xOrigin = -13602000;
const yOrigin = 5813000;
const halfWidth = 6000;

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    xOrigin - halfWidth,
    xOrigin + halfWidth,
    yOrigin - halfWidth,
    yOrigin + halfWidth,
);

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a Giro3D instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x0a3b59,
    },
});

// Creates a map that will contain the layer
const map = new Map('planar', {
    extent,
    hillshading: true,
    discardNoData: true,
    doubleSided: true,
    backgroundColor: 'white',
});

instance.add(map);

const source = new TiledImageSource({
    source: new XYZ({
        minZoom: 10,
        maxZoom: 16,
        url: 'https://3d.oslandia.com/dem/MtStHelens-tiles/{z}/{x}/{y}.tif',
    }),
    format: new GeoTIFFFormat(),
});

const floor = 1100;
const ceiling = 2500;

const values = colormap({ colormap: 'viridis', nshades: 256 });
const colors = values.map(v => new Color(v));

const dem = new ElevationLayer({
    name: 'dem',
    extent,
    source,
    colorMap: new ColorMap(colors, floor, ceiling, ColorMapMode.Elevation),
});

map.addLayer(dem);

instance.camera.camera3D.position.set(-13594700, 5819700, 7300);

// Instanciates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

controls.target.set(-13603000, 5811000, 0);

instance.useTHREEControls(controls);

// We use the DrawTool to draw the path on the map.
const drawTool = new DrawTool(instance, {
    drawObjectOptions: {
        lineMaterial: new LineBasicMaterial({ color: 'orange' }),
    },
});

// The markers that will show each sample along the elevation profile
const markers = [];
const markerGeometry = new SphereGeometry(30);
const markerMaterial = new MeshBasicMaterial({ color: 'red', depthTest: false });

// The 3D line that will follow the elevation profile
const line = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({ color: 'red', depthTest: false }),
);
line.visible = false;
instance.add(line);

function createMarker(x, y, z) {
    const marker = new Mesh(markerGeometry, markerMaterial);
    marker.position.set(x, y, z);
    marker.renderOrder = 100;
    instance.add(marker);
    markers.push(marker);
    marker.updateMatrixWorld(true);
}

function updateMarkers(points) {
    // Let's remove pre-existing sample markers.
    markers.forEach(m => m.removeFromParent());
    markers.length = 0;

    for (const point of points) {
        // Let's create a marker at this position to visualize the sample on the map.
        createMarker(point.x, point.y, point.z);
    }

    line.visible = true;
    line.renderOrder = 100;
    line.geometry.setFromPoints(points);
    line.updateMatrixWorld(true);
}

let currentChart;

function updateProfileChart(points) {
    const canvas = document.getElementById('profileChart');

    ChartJS.Chart.register(
        ChartJS.LinearScale,
        ChartJS.LineController,
        ChartJS.PointElement,
        ChartJS.LineElement,
        ChartJS.Title,
        ChartJS.Legend,
        ChartJS.Filler,
    );

    const data = [];
    let distance = 0;

    // Let's process our datapoints.
    // On the X axis, we will have the horizontal distance along the curve.
    // On the Y axis, we will have the elevations.
    for (let i = 0; i < points.length; i++) {
        const pt = points[i];

        if (i > 0) {
            const prev = new Vector2(points[i - 1].x, points[i - 1].y);
            const curr = new Vector2(points[i].x, points[i].y);

            distance += Math.round(curr.distanceTo(prev));
        }

        data.push({ x: distance, y: pt.z });
    }

    const dataset = {
        label: 'Profile',
        data,
        fill: true,
        borderWidth: 2,
        pointRadius: 2,
        backgroundColor: '#FF000030',
        borderColor: '#FF000080',
        yAxisID: 'y',
    };

    currentChart?.destroy();

    // Let's build our elevation profile chart.
    const chart = new ChartJS.Chart(canvas, {
        type: 'line',
        data: {
            datasets: [dataset],
        },
        options: {
            animation: true,
            parsing: false,
            plugins: {
                legend: {
                    display: false,
                    position: 'bottom',
                },
                title: {
                    display: true,
                    text: 'Elevation profile',
                },
            },
            scales: {
                x: {
                    display: true,
                    bounds: 'data',
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'horizontal distance (meters)',
                    },
                },
                y: {
                    bounds: 'data',
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'elevation (meters)',
                    },
                },
            },
        },
    });

    currentChart = chart;
}

function computeElevationProfile() {
    // We first start by drawing a LineString on the map.
    return drawTool.startAsAPromise('LineString').then(lineString => {
        const start = performance.now();

        // Then we need to sample this line according to the number of samples
        // selected by the user. We are using a THREE.js CurvePath for that.
        const path = new CurvePath();

        const coordinates = lineString.coordinates;

        // For each pair of coordinates, we create a linearly interpolated curve
        for (let i = 0; i < coordinates.length - 1; i++) {
            const [x0, y0] = coordinates[i];
            const [x1, y1] = coordinates[i + 1];

            const line = new LineCurve(new Vector2(x0, y0), new Vector2(x1, y1));

            path.add(line);
        }

        // And then we sample this curve to have our evenly spaced points
        const sampleCount = document.getElementById('sampleCount').valueAsNumber;
        const points = path.getSpacedPoints(sampleCount - 1);

        const chartPoints = [];

        for (const point of points) {
            const coordinates = new Coordinates(extent.crs(), point.x, point.y, 0);

            // Get the elevation for our current coordinate
            const result = map.getElevation({ coordinates });

            // Elevation sampling can return zero or more samples:
            // - Zero sample happens if the coordinate is outside the map's extent
            //   or if no data has been loaded yet.
            // - More than one sample happens because the samples are taken from map tiles, and
            //   they are organized in a hierarchical grid, where parent tiles overlap their children.
            if (result.samples.length > 0) {
                // Let's sort the samples to get the highest resolution sample first
                result.samples.sort((a, b) => a.resolution - b.resolution);

                const elevation = result.samples[0].elevation;

                // Let's populate or list of data points.
                chartPoints.push(new Vector3(point.x, point.y, elevation));
            }
        }

        updateMarkers(chartPoints);
        updateProfileChart(chartPoints);

        const end = performance.now();
        console.log(`elapsed: ${(end - start).toFixed(1)} ms`);
    });
}

const button = document.getElementById('start');

button.onclick = () => {
    button.disabled = true;
    computeElevationProfile().then(() => {
        button.disabled = false;
    });
};

updateProfileChart([]);

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
