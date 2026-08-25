/** The one place the video's shape is defined. Read by the scene and by scripts/render.ts. */
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
/**
 * 30 s, not 60.
 *
 * Sixty was too long to hold attention for a silent, steady animation — the
 * kind of thing you scroll past. Halving it also doubles the drawing speed,
 * because draw time is distributed by track length rather than fixed per tour.
 */
export const DURATION_SECONDS = 30;
export const TOTAL_FRAMES = FPS * DURATION_SECONDS;

/**
 * How much larger than the frame the map layers are rasterised.
 *
 * During a zoom the layers are built for the target view and transformed into
 * place, and that transform both scales *and* shifts. Without margin the shift
 * pulls the rasterised area off the edge and the background shows through —
 * measured at up to 146 px on the widest camera move, so 1.35x leaves room.
 */
export const OVERSCAN = 1.35;
export const OVER_WIDTH = Math.round(WIDTH * OVERSCAN);
export const OVER_HEIGHT = Math.round(HEIGHT * OVERSCAN);
export const OVER_X = Math.round((OVER_WIDTH - WIDTH) / 2);
export const OVER_Y = Math.round((OVER_HEIGHT - HEIGHT) / 2);
