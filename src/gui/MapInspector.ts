// eslint-disable-next-line import/no-named-as-default
import type GUI from 'lil-gui';
import type { AxesHelper, GridHelper } from 'three';
import { Color, MathUtils } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type Instance from '../core/Instance';
import TileMesh from '../core/TileMesh';
import type Map from '../entities/Map';
import type { BoundingBoxHelper } from '../helpers/Helpers';
import Helpers from '../helpers/Helpers';
import EntityInspector from './EntityInspector';
import RenderingState from '../renderer/RenderingState';
import LayerInspector from './LayerInspector';
import HillshadingPanel from './HillshadingPanel';
import ContourLinePanel from './ContourLinePanel';

function createTileLabel() {
    const text = document.createElement('div');

    text.style.color = '#FFFFFF';
    text.style.padding = '0.2em 1em';
    text.style.textShadow = '2px 2px 2px black';
    text.style.textAlign = 'center';
    text.style.fontSize = '12px';
    text.style.backgroundColor = 'rgba(0,0,0,0.5)';

    return text;
}

class MapInspector extends EntityInspector {
    /** The inspected map. */
    map: Map;
    /** Toggle the wireframe rendering of the map. */
    wireframe: boolean;
    /** Toggle the frozen property of the map. */
    frozen: boolean;
    showOutline: boolean;
    showGrid: boolean;
    renderState: string;
    layerCount: number;
    background: Color;
    backgroundOpacity: number;
    extentColor: Color;
    showExtent: boolean;
    showTileInfo: boolean;
    extentHelper: BoundingBoxHelper | null;
    mapSegments: number;
    labels: globalThis.Map<number, CSS2DObject>;
    hillshadingPanel: HillshadingPanel;
    contourLinePanel: ContourLinePanel;
    /** The layer folder. */
    layerFolder: GUI;
    layers: LayerInspector[];
    private _fillLayersCb: () => void;
    grid?: GridHelper;
    axes?: AxesHelper;

    /**
     * Creates an instance of MapInspector.
     *
     * @param parentGui The parent GUI.
     * @param instance The Giro3D instance.
     * @param map The inspected Map.
     */
    constructor(parentGui: GUI, instance: Instance, map: Map) {
        super(parentGui, instance, map, {
            title: `Map ('${map.id}')`,
            visibility: true,
            boundingBoxColor: true,
            boundingBoxes: true,
            opacity: true,
        });

        this.map = map;
        this.wireframe = this.map.wireframe ?? false;
        this.frozen = this.map.frozen ?? false;
        this.showOutline = this.map.showOutline ?? false;
        this.showGrid = false;
        this.renderState = 'Normal';

        this.addController<never>(this.map.materialOptions, 'discardNoData')
            .name('Discard no-data values')
            .onChange(() => this.notify(this.map));
        this.layerCount = this.map.layerCount;
        this.background = this.map.materialOptions.backgroundColor;
        this.backgroundOpacity = this.map.materialOptions.backgroundOpacity;

        this.extentColor = new Color('red');
        this.showExtent = false;
        this.showTileInfo = false;
        this.extentHelper = null;

        this.mapSegments = this.map.segments;

        this.labels = new window.Map();

        this.addController<number>(this.map, 'renderOrder')
            .name('Render order')
            .onChange(() => this.notify(map));
        this.addController<number>(this, 'mapSegments')
            .name('Tile subdivisions')
            .min(2)
            .max(128)
            .onChange(v => this.updateSegments(v));
        this.addController<number>(this.map.geometryPool, 'size')
            .name('Geometry pool');
        if (this.map.materialOptions.elevationRange) {
            this.addController<number>(this.map.materialOptions.elevationRange, 'min')
                .name('Elevation range minimum')
                .onChange(() => this.notify(map));

            this.addController<number>(this.map.materialOptions.elevationRange, 'max')
                .name('Elevation range maximum')
                .onChange(() => this.notify(map));
        }
        this.addController<number>(this.map.imageSize, 'width')
            .name('Tile width  (pixels)');
        this.addController<number>(this.map.imageSize, 'height')
            .name('Tile height  (pixels)');
        this.addController<boolean>(this, 'showGrid')
            .name('Show grid')
            .onChange(v => this.toggleGrid(v));
        this.addController<boolean>(this.map.materialOptions.terrain, 'enabled')
            .name('Terrain deformation')
            .onChange(() => this.notify(map));
        this.addController<boolean>(this.map.materialOptions.terrain, 'stitching')
            .name('Terrain stitching')
            .onChange(() => this.notify(map));
        this.addColorController(this, 'background')
            .name('Background')
            .onChange(v => this.updateBackgroundColor(v));
        this.addController<number>(this, 'backgroundOpacity')
            .name('Background opacity')
            .min(0)
            .max(1)
            .onChange(v => this.updateBackgroundOpacity(v));
        this.addController<boolean>(this, 'wireframe')
            .name('Wireframe')
            .onChange(v => this.toggleWireframe(v));
        this.addController<boolean>(this, 'showOutline')
            .name('Show tiles outline')
            .onChange(v => this.toggleOutlines(v));
        this.addController<boolean>(this, 'showTileInfo')
            .name('Show tile info')
            .onChange(() => this.toggleBoundingBoxes());
        this.addController<boolean>(this, 'showExtent')
            .name('Show extent')
            .onChange(() => this.toggleExtent());
        this.addColorController(this, 'extentColor')
            .name('Extent color')
            .onChange(() => this.updateExtentColor());

        this.hillshadingPanel = new HillshadingPanel(
            this.map.materialOptions.hillshading,
            this.gui,
            instance,
        );

        this.contourLinePanel = new ContourLinePanel(
            this.map.materialOptions.contourLines,
            this.gui,
            instance,
        );

        this.addController<number>(this, 'layerCount').name('Layer count');
        this.addController<string>(this, 'renderState', ['Normal', 'Picking'])
            .name('Render state')
            .onChange(v => this.setRenderState(v));
        this.addController<never>(this, 'dumpTiles').name('Dump tiles in console');
        this.addController<never>(this, 'disposeMapAndLayers').name('Dispose map and layers');

        this.layerFolder = this.gui.addFolder('Layers');

        this.layers = [];

        this._fillLayersCb = () => this.fillLayers();
        this.instance.addEventListener('layers-initialized', this._fillLayersCb);

        this.map.addEventListener('layer-added', this._fillLayersCb);
        this.map.addEventListener('layer-removed', this._fillLayersCb);
        this.map.addEventListener('layer-order-changed', this._fillLayersCb);

        this.fillLayers();
    }

    disposeMapAndLayers() {
        const layers = this.map.getLayers();
        for (const layer of layers) {
            this.map.removeLayer(layer, { disposeLayer: true });
        }
        this.instance.remove(this.map);
        this.notify();
    }

    getOrCreateLabel(obj: TileMesh) {
        let label = this.labels.get(obj.id);
        if (!label) {
            label = new CSS2DObject(createTileLabel());
            label.name = 'MapInspector label';
            obj.addEventListener('dispose', () => {
                label.element.remove();
                label.remove();
            });
            obj.add(label);
            obj.updateMatrixWorld(true);
            this.labels.set(obj.id, label);
        }
        return label;
    }

    updateLabel(tile: TileMesh, visible: boolean, color: Color) {
        if (!visible) {
            const label = this.labels.get(tile.id);
            if (label) {
                label.element.remove();
                label.parent?.remove(label);
                this.labels.delete(tile.id);
            }
        } else {
            const isVisible = tile.visible && tile.material.visible;
            const label = this.getOrCreateLabel(tile);
            const element = label.element;
            let innerText = `
            Map=${this.map.id}
            {x=${tile.x},y=${tile.y}} LOD=${tile.z}
            (node #${tile.id})
            progress=${Math.ceil(tile.progress * 100)}%
            layers=${tile.material.getLayerCount()}
            `;
            for (const layer of this.map.getLayers()) {
                const info = layer.getInfo(tile);
                innerText += `Layer '${layer.id}' - (images=${info.imageCount}, state=${info.state})\n`;
            }
            element.innerText = innerText;
            element.style.color = `#${color.getHexString()}`;
            element.style.opacity = isVisible ? '100%' : '0%';
            tile.OBB.box3D.getCenter(label.position);
            label.updateMatrixWorld();
        }
    }

    toggleBoundingBoxes() {
        const color = new Color(this.boundingBoxColor);
        const noDataColor = new Color('gray');
        // by default, adds axis-oriented bounding boxes to each object in the hierarchy.
        // custom implementations may override this to have a different behaviour.
        // @ts-ignore
        this.rootObject.traverseOnce(obj => {
            if (obj instanceof TileMesh) {
                const tile = obj as TileMesh;
                let finalColor = new Color();
                const layerCount = obj.material.getLayerCount();
                if (layerCount === 0) {
                    finalColor = noDataColor;
                } else {
                    finalColor = color;
                }
                this.addOrRemoveBoundingBox(tile, this.boundingBoxes, finalColor);

                this.updateLabel(tile, this.showTileInfo, finalColor);
            }
        });
        this.notify(this.entity);
    }

    updateBackgroundOpacity(a: number) {
        this.backgroundOpacity = a;
        this.map.materialOptions.backgroundOpacity = a;
        this.notify(this.map);
    }

    updateBackgroundColor(color: Color) {
        this.background = color;
        this.map.materialOptions.backgroundColor = color;
        this.notify(this.map);
    }

    updateExtentColor() {
        if (this.extentHelper) {
            this.instance.threeObjects.remove(this.extentHelper);
            this.extentHelper.material.dispose();
            this.extentHelper.geometry.dispose();
            this.extentHelper = null;
        }
        this.toggleExtent();
    }

    toggleExtent() {
        if (!this.extentHelper && this.showExtent) {
            const { min, max } = this.map.getElevationMinMax();
            const box = this.map.extent.toBox3(min, max);
            this.extentHelper = Helpers.createBoxHelper(box, this.extentColor);
            this.instance.threeObjects.add(this.extentHelper);
            this.extentHelper.updateMatrixWorld(true);
        }

        if (this.extentHelper) {
            this.extentHelper.visible = this.showExtent;
        }

        this.notify(this.map);
    }

    updateSegments(v: number) {
        const val = MathUtils.floorPowerOfTwo(v);
        this.mapSegments = val;
        if (this.map.segments !== val) {
            this.map.segments = val;
            this.notify(this.map);
        }
    }

    setRenderState(state: string) {
        switch (state) {
            case 'Normal':
                this.map.setRenderState(RenderingState.FINAL);
                break;
            case 'Picking':
                this.map.setRenderState(RenderingState.PICKING);
                break;
            default:
                break;
        }

        this.notify(this.map);
    }

    removeEventListeners() {
        this.instance.removeEventListener('layers-initialized', this._fillLayersCb);

        this.map.removeEventListener('layer-added', this._fillLayersCb);
        this.map.removeEventListener('layer-removed', this._fillLayersCb);
        this.map.removeEventListener('layer-order-changed', this._fillLayersCb);
    }

    dispose() {
        super.dispose();
        this.removeEventListeners();
    }

    dumpTiles() {
        console.log(this.map.level0Nodes);
    }

    /**
     * @param tile The tile to decorate.
     * @param add If true, bounding box is added, otherwise it is removed.
     * @param color The bounding box color.
     */
    // eslint-disable-next-line class-methods-use-this
    addOrRemoveBoundingBox(tile: TileMesh, add: boolean, color: Color) {
        if (add && tile.OBB && tile.visible && tile.material && tile.material.visible) {
            Helpers.addOBB(tile, tile.OBB, color);
        } else {
            Helpers.removeOBB(tile);
        }
    }

    updateValues() {
        super.updateValues();
        this.toggleBoundingBoxes();
        this.layerCount = this.map.layerCount;
        this.layers.forEach(l => l.updateValues());
    }

    fillLayers() {
        while (this.layers.length > 0) {
            this.layers.pop().dispose();
        }
        // We reverse the order so that the layers are displayed in a natural order:
        // top layers in the inspector are also on top in the composition.
        this.map.getLayers().reverse().forEach(lyr => {
            const gui = new LayerInspector(this.layerFolder, this.instance, this.map, lyr);
            this.layers.push(gui);
        });
    }

    toggleGrid(value: boolean) {
        if (!value) {
            if (this.grid) {
                this.grid.parent.remove(this.grid);
            }
            if (this.axes) {
                this.axes.parent.remove(this.axes);
            }
        } else {
            const dims = this.map.extent.dimensions();
            const size = Math.max(dims.x, dims.y) * 1.1;
            const origin = this.map.extent.centerAsVector3();

            const grid = Helpers.createGrid(origin, size, 20);
            this.instance.scene.add(grid);
            grid.updateMatrixWorld(true);
            this.grid = grid;

            const axes = Helpers.createAxes(size * 0.05);
            // We don't want to add the axes to the grid because the grid is rotated,
            // which would rotate the axes too and give a wrong information about the vertical axis.
            axes.position.copy(origin);
            this.axes = axes;
            this.axes.updateMatrixWorld(true);
            this.instance.scene.add(axes);
        }
        this.notify();
    }

    toggleOutlines(value: boolean) {
        this.map.traverseMaterials(material => {
            (material as any).showOutline = value;
            material.needsUpdate = true;
        });
        this.notify(this.map);
    }

    toggleWireframe(value: boolean) {
        this.map.wireframe = value;
        this.map.traverseMaterials(material => {
            (material as any).wireframe = value;
        });
        this.notify(this.map);
    }
}

export default MapInspector;
