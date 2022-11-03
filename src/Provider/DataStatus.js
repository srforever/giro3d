/** Describe the status of a data request. */
const DataStatus = {
    /** Data for this tile will *never* be available. */
    DATA_UNAVAILABLE: 1,
    /** Data for this tile *might* be available in later requests. */
    DATA_NOT_AVAILABLE_YET: 2,
    /** Data for this tile is already loaded, there is nothing to do in the provider side. */
    DATA_ALREADY_LOADED: 3,
};

export default DataStatus;
