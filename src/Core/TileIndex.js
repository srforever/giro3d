const TOP = 0;
const TOP_RIGHT = 1;
const RIGHT = 2;
const BOTTOM_RIGHT = 3;
const BOTTOM = 4;
const BOTTOM_LEFT = 5;
const LEFT = 6;
const TOP_LEFT = 7;

class TileIndex {
    constructor() {
        this.tiles = new Map();
    }

    /**
     * Adds a tile to the index.
     *
     * @param {object} tile the tile to add.
     * @param {number} tile.x the tile's X coordinate.
     * @param {number} tile.y the tile's Y coordinate.
     * @param {number} tile.z the tile's Z coordinate.
     */
    addTile(tile) {
        const key = TileIndex.getKey(tile.x, tile.y, tile.z);
        this.tiles.set(key, new WeakRef(tile)); // eslint-disable-line no-undef
    }

    static getKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    /**
     * Returns an array containing the 8 possible neighbours of a tile.
     * A neighbor is a tile at the same level or higher level located according to the clock order
     * from north:
     * 7 : north west -- 0 : north -- 1 : north east
     * 6 : west       -- THE  TILE -- 2 : east
     * 5 : south west -- 4 : south -- 3 : south east
     * If there is no neighbor, if it isn't visible or if it is a smaller level one, return null.
     *
     * @param {object} tile the tile to query
     * @returns {Array} neighbors : Array of found neighbors
     */
    getNeighbours(tile) {
        const { x, y, z } = tile;

        const result = Array(8);

        result[TOP] = this._searchTileOrAncestor(x, y + 1, z);
        result[TOP_RIGHT] = this._searchTileOrAncestor(x + 1, y + 1, z);
        result[RIGHT] = this._searchTileOrAncestor(x + 1, y, z);
        result[BOTTOM_RIGHT] = this._searchTileOrAncestor(x + 1, y - 1, z);
        result[BOTTOM] = this._searchTileOrAncestor(x, y - 1, z);
        result[BOTTOM_LEFT] = this._searchTileOrAncestor(x - 1, y - 1, z);
        result[LEFT] = this._searchTileOrAncestor(x - 1, y, z);
        result[TOP_LEFT] = this._searchTileOrAncestor(x - 1, y + 1, z);

        return result;
    }

    static getParent(x, y, z) {
        if (z === 0) {
            return null;
        }

        const newX = Math.floor(x / 2);
        const newY = Math.floor(y / 2);
        const newZ = z - 1;
        return { x: newX, y: newY, z: newZ };
    }

    update() {
        // Remove obsolete entries
        const keys = [...this.tiles.keys()];
        for (const key of keys) {
            const entry = this.tiles.get(key);
            if (!entry.deref()) {
                this.tiles.delete(key);
            }
        }
    }

    /**
     * Search for the specific tile by coordinates if any, or any valid ancestor.
     *
     * @param {number} x The tile X coordinate.
     * @param {number} y The tile Y coordinate.
     * @param {number} z The tile Z coordinate (zoom level).
     * @returns {object|null} The matching tile if found, null otherwise.
     * @memberof TileIndex
     */
    _searchTileOrAncestor(x, y, z) {
        const key = TileIndex.getKey(x, y, z);
        const entry = this.tiles.get(key);

        if (entry) {
            const n = entry.deref();

            if (n && n.material && n.material.visible) {
                return n;
            }
        }

        const parent = TileIndex.getParent(x, y, z);
        if (!parent) {
            return null;
        }

        return this._searchTileOrAncestor(parent.x, parent.y, parent.z);
    }
}

export default TileIndex;
export {
    TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT,
};
