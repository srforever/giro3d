/**
 * MainLoop's update events list that are fired using
 * {@link Instance#execFrameRequesters}.
 */
export interface MainLoopFrameEvents {
    /** fired at the start of the update */
    'update_start': {},
    /** fired before the camera update */
    'before_camera_update': {},
    /** fired after the camera update */
    'after_camera_update': {},
    /** fired before the layer update */
    'before_layer_update': {},
    /** fired after the layer update */
    'after_layer_update': {},
    /** fired before the render */
    'before_render': {},
    /** fired after the render */
    'after_render': {},
    /** fired at the end of the update */
    'update_end': {},
}

/**
 * MainLoop's update events list that are fired using
 * {@link Instance#execFrameRequesters}.
 *
 * @deprecated Use {@link MainLoopFrameEvents} instead.
 */
export const MAIN_LOOP_EVENTS: Record<string, keyof MainLoopFrameEvents> = {
    /** fired at the start of the update */
    UPDATE_START: 'update_start',
    /** fired before the camera update */
    BEFORE_CAMERA_UPDATE: 'before_camera_update',
    /** fired after the camera update */
    AFTER_CAMERA_UPDATE: 'after_camera_update',
    /** fired before the layer update */
    BEFORE_LAYER_UPDATE: 'before_layer_update',
    /** fired after the layer update */
    AFTER_LAYER_UPDATE: 'after_layer_update',
    /** fired before the render */
    BEFORE_RENDER: 'before_render',
    /** fired after the render */
    AFTER_RENDER: 'after_render',
    /** fired at the end of the update */
    UPDATE_END: 'update_end',
} as const;
