const NORTH = 0;
const NORTH_EAST = 1;
const EAST = 2;
const SOUTH_EAST = 3;
const SOUTH = 4;
const SOUTH_WEST = 5;
const WEST = 6;
const NORTH_WEST = 7;

class TileIndex {
    constructor() {
        this.indexedTiles = new Map();
    }

    /**
     * Make a weak reference to a tile in the index
     *
     * @param {object} tile the TileMesh to evaluate
     */
    addTile(tile) {
        const key = [tile.x, tile.y, tile.z].join(',');
        this.indexedTiles.set(key, new WeakRef(tile)); // eslint-disable-line no-undef
    }

    /**
     * Find neighbors for a tile.
     * A neighbor is a tile at the same level or higher level located according to the clock order
     * from north:
     * 7 : north west -- 0 : north -- 1 : north east
     * 6 : west       -- THE  TILE -- 2 : east
     * 5 : south west -- 4 : south -- 3 : south east
     * If there is no neighbor, if it isn't visible or if it is a smaller level one, return null.
     *
     * @param {object} tile the TileMesh to evaluate
     * @returns {Array} neighbors : Array of found neighbors
     */
    getNeighbours(tile) {
        let match = false;
        const { x, y, z } = tile;
        const neighbors = [null, null, null, null, null, null, null, null];
        for (let i = 0; i < 8; i++) {
            this.neighbour = i;
            if (this._searchNeighbour(x, y, z, neighbors)) {
                match = true;
            }
        }
        if (match) {
            return neighbors;
        }
        return null;
    }

    _searchNeighbour(x, y, z, neighbors) {
        let match = false;
        const key = this._makeKey(x, y, z);
        const possibleNeighbor = this.indexedTiles.get(key);
        if (possibleNeighbor !== undefined) {
            const neighbor = possibleNeighbor.deref();
            if (neighbor && neighbor.material) {
                if (neighbor.material.visible) {
                    neighbors[this.neighbour] = neighbor;
                    match = true;
                } else {
                    return false;
                }
            } else {
                // The neighbor is cleared, empty the ref
                this.indexedTiles.delete(key);
            }
        }
        if (!match && z > 0) {
            x = Math.floor(x / 2);
            y = Math.floor(y / 2);
            z -= 1;
            match = this._searchNeighbour(x, y, z, neighbors);
        }
        return match;
    }

    _makeKey(x, y, z) {
        let key;
        const l = z === 0 ? 0 : 2 ** z - 1;
        switch (this.neighbour) {
            case NORTH:
                key = [x, y < l ? y + 1 : y, z];
                break;
            case NORTH_EAST:
                key = [x + 1, y < l ? y + 1 : y, z];
                break;
            case EAST:
                key = [x + 1, y, z];
                break;
            case SOUTH_EAST:
                key = [x + 1, y - 1, z];
                break;
            case SOUTH:
                key = [x, y - 1, z];
                break;
            case SOUTH_WEST:
                key = [x > 0 ? x - 1 : 0, y - 1, z];
                break;
            case WEST:
                key = [x > 0 ? x - 1 : 0, y, z];
                break;
            case NORTH_WEST:
                key = [x > 0 ? x - 1 : 0, y < l ? y + 1 : y, z];
                break;
            default:
                return null;
        }
        return key.join(',');
    }
}

export default TileIndex;
