import type GUI from 'lil-gui';
import UrlTile from 'ol/source/UrlTile.js';
import type TileSource from 'ol/source/Tile.js';
import type Instance from '../core/Instance';
import Panel from './Panel';
import CogSource from '../sources/CogSource';
import TiledImageSource from '../sources/TiledImageSource';
import * as MemoryUsage from '../core/MemoryUsage';
import type { ImageSource } from '../sources';

/**
 * Inspector for a source.
 *
 */
class SourceInspector extends Panel {
    source: ImageSource;
    sourceType: string;
    networkOptions: string;
    url?: string;
    cogChannels?: string;
    subtype?: string;
    crs?: string;
    resolutions?: number;
    cpuMemoryUsage = 'unknown';
    gpuMemoryUsage = 'unknown';

    /**
     * @param gui - The GUI.
     * @param instance - The Giro3D instance.
     * @param source - The source.
     */
    constructor(gui: GUI, instance: Instance, source: ImageSource) {
        super(gui, instance, 'Source');

        this.source = source;
        this.sourceType = 'unknown';
        this.networkOptions = '';

        this._addControllers(source);
    }

    _addControllers(source: object) {
        this.addController<string>(this, 'cpuMemoryUsage').name('Memory usage (CPU)');
        this.addController<string>(this, 'gpuMemoryUsage').name('Memory usage (GPU)');

        if (source instanceof CogSource) {
            const cogSource = source as CogSource;
            this.url = cogSource.url.toString();
            this.sourceType = 'CogSource';
            this.addController<string>(this, 'sourceType').name('Type');
            this.addController<string>(this, 'url').name('URL');
            if (source.channels) {
                this.cogChannels = JSON.stringify(source.channels);
                this.addController<string>(this, 'cogChannels')
                    .name('Channel mapping')
                    .onChange(v => {
                        const channels = JSON.parse(v);
                        source.channels = channels;
                        this.instance.notifyChange();
                    });
            }
        } else if (source instanceof TiledImageSource) {
            this.sourceType = 'TiledImageSource';
            this.addController<string>(this, 'sourceType').name('Type');
            this.processOpenLayersSource(source.source);
        }
    }

    updateValues(): void {
        const memUsage = this.source.getMemoryUsage({ renderer: this.instance.renderer });
        this.cpuMemoryUsage = MemoryUsage.format(memUsage.cpuMemory);
        this.gpuMemoryUsage = MemoryUsage.format(memUsage.gpuMemory);

        this._controllers.forEach(c => c.updateDisplay());
    }

    processOpenLayersSource(source: TileSource) {
        const proj = source.getProjection();

        // default value in case we can't process the constructor name
        this.subtype = 'Unknown';

        if (proj) {
            this.crs = proj.getCode();
            this.addController<string>(this, 'crs').name('CRS');
        }

        const res = source.getResolutions();
        if (res) {
            this.resolutions = res.length;
            this.addController<number>(this, 'resolutions').name('Zoom levels');
        }

        if (source instanceof UrlTile) {
            const ti = source as UrlTile;
            const urls = ti.getUrls();
            if (urls && urls.length > 0) {
                this.url = urls[0];
            }
            this.addController<string>(this, 'url').name('Main URL');
        }

        if (source.constructor.name) {
            this.subtype = source.constructor.name;
        }
        this.addController<string>(this, 'subtype').name('Inner source');
    }
}

export default SourceInspector;
