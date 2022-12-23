/**
 * @module gui/outliner/Outliner
 */
import GUI from 'lil-gui';
import { Object3D } from 'three';
import Instance from '../../Core/Instance.js';
import Helpers from '../../helpers/Helpers.js';
import Panel from '../Panel.js';
import OutlinerPropertyView from './OutlinerPropertyView.js';

/**
 * Returns the colors associated with the THREE object type.
 *
 * @param {Object3D} obj the THREE object
 * @returns {object} the object containing foreground and background colors
 */
function selectColor(obj) {
    switch (obj.type) {
        case 'Mesh':
            return { back: 'orange', fore: 'black' };
        case 'Points':
            return { back: 'red', fore: 'white' };
        case 'Object3D':
            return { back: 'gray', fore: 'white' };
        case 'Scene':
            return { back: '#CCCCCC', fore: 'black' };
        case 'Group':
            return { back: 'green', fore: 'white' };
        default:
            return { back: 'blue', fore: 'white' };
    }
}

function createTreeViewNode(obj, marginLeft, clickHandler) {
    const div = document.createElement('button');
    div.style.textAlign = 'left';
    div.onclick = () => clickHandler(obj);

    const name = document.createElement('p');
    name.style.marginLeft = `${marginLeft}px`;
    name.style.marginTop = '0px';
    name.style.marginBottom = '0px';
    name.style.background = 'transparent';
    const { fore, back } = selectColor(obj);
    name.innerHTML = `<span style="border-radius: 6px; padding: 2px; font-family: monospace; background-color: ${back}; color: ${fore}">${obj.type}</span> <span style="font-family: monospace;">${obj.name}</span>`;

    div.appendChild(name);

    return div;
}

/**
 * Creates a treeview node for the specified object and its children.
 *
 * @param {Object3D} obj the THREE object.
 * @param {Function} clickHandler the function to call when a node is clicked.
 * @param {number} level the hierarchy level
 */
function createTreeViewNodeWithDescendants(obj, clickHandler, level = 0) {
    if (obj.type !== 'Scene' && obj.treeviewVisible === false) {
        return null;
    }

    const div = document.createElement('div');
    div.style.background = 'transparent';
    div.style.opacity = obj.visible ? '100%' : '50%';

    // create the DOM element for the object itself
    const marginLeft = level * 15;
    div.appendChild(createTreeViewNode(obj, marginLeft, clickHandler));

    // recursively create the DOM elements for the children
    const childLevel = level + 1;
    obj.children.forEach(child => {
        const childNode = createTreeViewNodeWithDescendants(
            child,
            clickHandler,
            childLevel,
        );
        if (childNode) {
            div.appendChild(childNode);
        }
    });

    return div;
}

function setAncestorsVisible(obj) {
    if (obj) {
        obj.treeviewVisible = true;
        setAncestorsVisible(obj.parent);
    }
}

/**
 * @param {Object3D} obj the object to process
 * @param {object} [filter] the search filter
 * @param {boolean} [filter.showHelpers] should we show helpers ?
 * @param {RegExp} [filter.searchRegex=null] the name filter
 */
function applySearchFilter(obj, filter) {
    if (shouldBeDisplayedInTree(obj, filter)) {
        setAncestorsVisible(obj);
    } else {
        obj.treeviewVisible = false;
    }

    if (obj.children) {
        obj.children.forEach(c => applySearchFilter(c, filter));
    }
}

function shouldBeDisplayedInTree(obj, filter) {
    if (obj.isHelper && !filter.showHelpers) {
        return false;
    }

    if (filter.searchRegex === null || filter.searchRegex.test(obj.name.toLowerCase())) {
        return true;
    }

    return false;
}

/**
 * Provides a tree view of the three.js [scene](https://threejs.org/docs/index.html?q=scene#api/en/scenes/Scene).
 *
 * @api
 */
class Outliner extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     */
    constructor(gui, instance) {
        super(gui, instance, 'Outliner');
        this.instance = instance;

        this._controllers = [];
        this._folders = [];

        this.filters = {
            showHelpers: false,
            searchQuery: '',
            searchRegex: null,
        };

        this.treeviewContainer = document.createElement('div');

        this.treeview = document.createElement('div');
        this.treeview.style.background = '#424242';
        this.treeview.id = 'treeview';
        this.treeview.style.height = '350px';
        this.treeview.style.overflow = 'auto';

        this.addController(this.filters, 'showHelpers')
            .name('Show helpers')
            .onChange(() => {
                this.search();
                this.instance.notifyChange();
            });
        this.addController(this.filters, 'searchQuery')
            .name('Name filter')
            .onChange(() => {
                this.search();
                this.instance.notifyChange();
            });
        this.treeviewContainer.appendChild(this.treeview);

        // A little bit of DOM hacking to insert the treeview in the GUI.
        const treeGui = this.gui.addFolder('Hierarchy');
        const children = treeGui.domElement.getElementsByClassName('children');
        children[0].appendChild(this.treeviewContainer);

        this.updateTreeView();

        this.propView = new OutlinerPropertyView(this.gui, this.instance);
    }

    updateValues() {
        this.updateTreeView();
    }

    onNodeClicked(obj) {
        this.select(obj);
        this.propView.populateProperties(obj);
        this.instance.notifyChange();
    }

    /**
     * Selects the object by displaying a bright bounding box around it.
     *
     * @param {Object3D} obj The object to select.
     */
    select(obj) {
        this.clearSelection();

        if (obj === this.selectionHelper) {
            return;
        }

        this.selectionHelper = Helpers.createSelectionBox(obj, '#00FF00');
        this.selectionHelper.name = 'selection';
    }

    /**
     * Unselect the currently selected object.
     */
    clearSelection() {
        if (this.selectionHelper && this.selectionHelper.parent) {
            this.selectionHelper.parent.remove(this.selectionHelper);
        }
        delete this.selectionHelper;
    }

    search() {
        this.filters.searchQuery = this.filters.searchQuery.trim().toLowerCase();
        this.filters.searchRegex = this.filters.searchQuery.length > 0
            ? new RegExp(this.filters.searchQuery)
            : null;
        this.updateTreeView();
    }

    updateObject(o) {
        o.updateMatrixWorld(true);
        this.instance.notifyChange();
    }

    updateTreeView() {
        if (this.gui._closed) {
            // we don't want to refresh the treeview if the GUI is collapsed.
            return;
        }

        if (this.rootNode) {
            this.treeview.removeChild(this.rootNode);
        }

        applySearchFilter(this.instance.scene, this.filters);

        this.rootNode = createTreeViewNodeWithDescendants(
            this.instance.scene,
            obj => this.onNodeClicked(obj),
        );
        this.treeview.appendChild(this.rootNode);
    }
}

export default Outliner;
