/**
 * @module gui/SourceInspector
 */
import GUI from 'lil-gui';
import Source from 'ol/source/Source.js';
import TileSource from 'ol/source/Tile.js';
import UrlTile from 'ol/source/UrlTile.js';
import Instance from '../core/Instance.js';
import Panel from './Panel.js';
import CogSource from '../sources/CogSource.js';
import CustomTiledImageSource from '../sources/CustomTiledImageSource.js';

/**
 * Inspector for a source.
 *
 * @api
 */
class SourceInspector extends Panel {
    /**
     * @param {GUI} gui The GUI.
     * @param {Instance} instance The Giro3D instance.
     * @param {object} source The source.
     */
    constructor(gui, instance, source) {
        super(gui, instance, 'Source');

        this.source = source;
        this.sourceType = 'unknown';
        this.networkOptions = {};

        this._addControllers(source);
    }

    _addControllers(source) {
        if (source.networkOptions) {
            this.networkOptions = JSON.stringify(source.networkOptions);
            this.addController(this, 'networkOptions').name('Network options');
        }

        if (source instanceof CogSource) {
            this.url = source.url.toString();
            this.sourceType = 'CogSource';
            this.addController(this, 'url').name('URL');
        } else if (source instanceof CustomTiledImageSource) {
            this.url = source.url.toString();
            this.sourceType = 'CustomTiledImageSource';
            this.addController(this, 'url').name('URL');
        } else if (source instanceof Source) {
            this.processOpenLayersSource(source);
        }

        this.addController(this, 'sourceType').name('Type');
    }

    processOpenLayersSource(source) {
        const proj = source.getProjection();

        // default value in case we can't process the constructor name
        this.sourceType = 'OpenLayers source';

        if (proj) {
            this.crs = proj.getCode();
            this.addController(this, 'crs').name('CRS');
        }

        if (source instanceof TileSource) {
            /** @type {TileSource} */
            const ts = source;
            const res = ts.getResolutions();
            if (res) {
                this.resolutions = res.length;
                this.addController(this, 'resolutions').name('Zoom levels');
            }
        }

        if (source instanceof UrlTile) {
            /** @type {UrlTile} */
            const ti = source;
            const urls = ti.getUrls();
            if (urls && urls.length > 0) {
                this.url = urls[0];
            }
            this.addController(this, 'url').name('Main URL');
        }

        if (source.constructor.name) {
            this.sourceType = `OpenLayers/${source.constructor.name}`;
        }
    }
}

export default SourceInspector;
